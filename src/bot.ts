import dotenv from 'dotenv';
dotenv.config();

import * as Discord from 'discord.js';
let client = new Discord.Client();

import glob from 'glob';
import path from 'path';
import logger from 'winston';

import EventService from './services/events';
import CommandHandler from './models/CommandHandler';
import GuildManager from './models/GuildManager';
import MessageService from './services/message';

import initializeWeb from './bot-web';
import { IBaseCommand } from './models/IBase';

glob.sync(__dirname + '/commands/*.js').forEach(async file => {
    let required = await import(path.resolve(file));

    if (!required.commands) {
        return;
    }

    let commands = null;
    if (typeof required.commands === 'function') {
        // we need to pass the bot as an argument. the function should immediately return the commands
        commands = required.commands(CommandHandler);
    } else {
        commands = required.commands;
    }
    if (required.initialize) {
        required.initialize(client);
    }

    // Loop through the commands and register them!
    commands.forEach((cmdData: IBaseCommand) => {
        let cmd = CommandHandler.registerCommand(
            cmdData.aliases,
            cmdData.prettyName,
            cmdData.help,
            cmdData.callback,
            cmdData.userPermissions,
            cmdData.executePermissions,
            cmdData.executeViaIntegration
        );

        // Don't forget parameters!
        if (cmdData.params) {
            cmdData.params.forEach(paramData => {
                cmd.addParam(paramData.name, paramData.type, paramData.optional == undefined ? false : paramData.optional, paramData.default);
            });
        }
    });
})

logger.remove(logger.transports.Console);
logger.add(new logger.transports.Console);
logger.level = 'debug';

// Register a new client
client.login(process.env.DISCORD_TOKEN);

// We are ready!
client.on('ready', async () => {
    logger.info('Connected');
    logger.info('Logged in as: ');
    logger.info(client.user.username + ' - (' + client.user.id + ')');

    client.user.setActivity('!help for commands');

    await GuildManager.connect();

    // Make sure we get up to date documents on each guild
    let guildPromises = [];
    client.guilds.cache.array().forEach(guild => {
        if (process.env.DEBUG_MODE == 'true') {
            if (guild.id == '659852554754064410') {
                guildPromises.push(GuildManager.addGuild(guild.id));
            }
        } else {
            guildPromises.push(GuildManager.addGuild(guild.id));
        }
    });

    // Once we've got all the data, fire an event
    Promise.all(guildPromises).then((guilds) => {
        EventService.emit('prox.guildsLoaded', guilds);
    })
});

client.on('voiceStateUpdate', (oldState: Discord.VoiceState, newState: Discord.VoiceState) => {
    let guildId = newState.guild.id;
    let voiceMgr = GuildManager.getVoiceManager(guildId);
    
    if (voiceMgr.inChannel() && voiceMgr.getChannel().members.size == 1) {
        voiceMgr.leaveChannel();
    }
});

// Save every five minutes
let guilds = [];

EventService.on('prox.guildsLoaded', async function (loaded) {
    guilds = loaded;
    function saveGuilds() {
        console.log('Saving guilds...');
        guilds.forEach(guild => {
            if (!guild) {
                return;
            }

            guild.save();
        });

        setTimeout(saveGuilds, 300000);
    }
    saveGuilds();

    // Initialize message service
    await MessageService.initialize();

    // Initialize web handler
    initializeWeb(client);
})

// We joined a guild
client.on('guildCreate', async guild => {
    if (process.env.DEBUG_MODE == 'true') {
        if (guild.id != '659852554754064410') {
            return;
        }
    }

    let newGuild = await GuildManager.addGuild(guild.id, true);
    EventService.emit('prox.guildAdded', newGuild);
    guilds.push(newGuild);
});

// We left a guild
client.on('guildDelete', (guild: any) => {
    if (process.env.DEBUG_MODE == 'true') {
        if (guild.id != '659852554754064410') {
            return;
        }
    }

    // Make sure we update any cache systems that may hold the doc
    GuildManager.removeGuild(guild.id)
    EventService.emit('prox.guildRemoved', guild.id);
    guilds.forEach((guilds, index) => {
        if (guild.guildId == guild.id) {
            guilds.splice(index, 1);
        }
    })
});

// We have a new message
client.on('message', async message => {
    let response = await MessageService.process(message);

    if (response) {
        MessageService.sendMessage(response, message.channel);
    }
});
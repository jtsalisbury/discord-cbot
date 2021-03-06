import { GuildMember, Message, User } from 'discord.js';
import fs from 'fs';
import GuildManager from '../models/GuildManager';
import { IBaseCommand } from '../models/IBase';
import * as _utils from '../services/utils';

let stb = <IBaseCommand>{};
stb.aliases = ['stb', 'spin'];
stb.prettyName = 'Spin The Bottle';
stb.help = 'Spin the bottle';
stb.category = 'Games';
stb.executeViaIntegration = false;
stb.params = []
stb.callback = async function(message: Message) {
    // Get members who are online, not bots
    let members = message.member.guild.members.cache.array().filter(member => {
        return member.presence.status == 'online' && !member.user.bot && member.id != message.author.id
    });

    if (members.length == 0) {
        return;
    }

    // Random member
    let member = members[Math.floor(Math.random() * members.length)];

    return `<@${message.author.id}>, you spun <@${member.id}>`;
}

let truths = [];
let dares = [];

let truth = <IBaseCommand>{};
truth.aliases = ['truth'];
truth.prettyName = 'Truth';
truth.help = 'Get a random truth';
truth.category = 'Games';
truth.params = []
truth.executeViaIntegration = true;
truth.callback = async function(message: Message) {
    return `> Your truth\n` + truths[Math.floor(Math.random() * truths.length)];
}

let dare = <IBaseCommand>{};
dare.aliases = ['dare'];
dare.prettyName = 'Dare';
dare.help = 'Get a random dare';
dare.category = 'Games';
dare.params = []
dare.executeViaIntegration = true;
dare.callback = async function(message: Message) {
    return  `> Your dare\n` + dares[Math.floor(Math.random() * dares.length)];
}

let mfkCache = {};

function newMFK(message) {
    let members = message.member.guild.members.cache.array().filter(member => {
        return !member.user.bot && member.id != message.author.id
    });

    if (members.length < 3) {
        return;
    }

    // Setup a cache to store the MFK options
    let guildId = message.guild.id;
    let uid = message.author.id;
    if (mfkCache[guildId]) {
        if (mfkCache[guildId][uid]) {
            return 'You already have an existing game - finish that one first!';
        }

        mfkCache[guildId][uid] = {};
    } else {
        mfkCache[guildId] = {
            [uid]: {}
        };
    }

    // Random members
    let randomMembers = []

    while (randomMembers.length < 3) {
        let member = members[Math.floor(Math.random() * members.length)];
        if (!randomMembers.includes(member)) {
            randomMembers.push(member);
        }
    }
    
    // Setup the cache
    mfkCache[guildId][uid] = {};
    randomMembers.forEach(member => {
        mfkCache[guildId][uid][member.id] = true;
    })

    // Get the member string
    let memberStr = randomMembers.map(member => {
        return `<@${member.id}>`;
    }).join(', ');

    return `> Who's ready to Marry, Fuck, Kill?\n<@${message.author.id}>, your options are: ${memberStr}\nType \`\`!mfk @marry @fuck @kill\`\``;
}

let pluralize = function(num) {
    if (num == 1) {
        return num + ' time';
    } 

    return num + ' times';
}

// Handle an existing game of MFK
function handleMFK(message: Message, marry: GuildMember, fuck: GuildMember, kill: GuildMember) {
    if (!fuck || !kill) {
        return 'You must specify each user you want to marry, fuck and kill';
    }

    let gameCache = mfkCache[message.guild.id];
    if (!gameCache || !gameCache[message.author.id]) {
        return 'No active game. Start one with !mfk';
    }

    gameCache = gameCache[message.author.id];

    // Check each user and make sure they're actually there
    if (!gameCache[marry.id]) {
        return 'Invalid entry for marry. Make sure they\'re one of your options!';
    }
    if (!gameCache[fuck.id]) {
        return 'Invalid entry for fuck. Make sure they\'re one of your options!';
    }
    if (!gameCache[kill.id]) {
        return 'Invalid entry for kill. Make sure they\'re one of your options!';
    }

    // Ensuring we don't have duplicates
    let idMap = [marry, fuck, kill].map(member => member.id);
    if ([...new Set(idMap)].length != 3) {
        return 'Make sure you don\'t have any duplicates!'
    }

    // Resolve the stats
    let guild = GuildManager.getGuild(message.guild.id);
    let marryStats = _utils.resolve(guild, 'statistics.mfk.married');
    let fuckStats = _utils.resolve(guild, 'statistics.mfk.fucked');
    let killStats = _utils.resolve(guild, 'statistics.mfk.killed');

    // Update the database
    marryStats[marry.id] = marryStats[marry.id] ?  marryStats[marry.id] + 1 : 1;
    fuckStats[fuck.id] = fuckStats[fuck.id] ?  fuckStats[fuck.id] + 1 : 1;
    killStats[kill.id] = killStats[kill.id] ?  killStats[kill.id] + 1 : 1;

    guild.markModified('statistics.mfk');

    // Delete the game
    mfkCache[message.guild.id][message.author.id] = undefined;

    return `<@${marry.id}> has been married ${pluralize(marryStats[marry.id])}\n<@${fuck.id}> has been fucked ${pluralize(fuckStats[fuck.id])}\n<@${kill.id}> has been killed ${pluralize(killStats[kill.id])}\n
    `
}

let mfk = <IBaseCommand>{}
mfk.aliases = ['mfk'];
mfk.prettyName = 'Marry, Fuck, Kill';
mfk.help = 'Choose who you would marry, who you would and who you would kill';
mfk.category = 'Games';
mfk.params = [{
    name: "marry",
    type: "member",
    optional: true
}, {
    name: "fuck",
    type: "member",
    optional: true
},  {
    name: "kill",
    type: "member",
    optional: true
}]
mfk.executeViaIntegration = false;
mfk.callback = async function(message: Message, marry: GuildMember, fuck: GuildMember, kill: GuildMember) {
    if (!marry) {
        return newMFK(message);
    }

    return handleMFK(message, marry, fuck, kill);
}

export let initialize = function(client) {
    client.on('ready', () => {
        let truthText = fs.readFileSync(__dirname + '/../assets/truths.txt').toString('utf-8');;
        truths = truthText.split('\n');

        let dareText = fs.readFileSync(__dirname + '/../assets/dares.txt').toString('utf-8');;
        dares = dareText.split('\n');
    })
}

export let commands = [stb, truth, dare, mfk]
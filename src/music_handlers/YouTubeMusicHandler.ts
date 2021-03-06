import { IBaseMusicHandler, ISongData } from '../models/IBase';
import ytdl from 'ytdl-core-discord';
import * as similar from 'string-similarity';
import ytlist from 'youtube-playlist';

const MATCH_CUTOFF = 0.7; // should be high enough to get rid of identical plays & really close ones? who knows
 
class YouTubeMusicHandler implements IBaseMusicHandler {
    public getName(): string {
        return 'YouTube';
    }

    public isMatch(link): boolean {
        return link.indexOf('youtube.com') !== -1;
    }

    public async getSongs(link): Promise<ISongData[]> {
        let links = [];
        let songs = [];

        // Determine whether we are dealing with a playlist or not
        if (link.indexOf('&list=') !== -1 || link.indexOf('playlist') !== -1) {
            // Query YouTube to get all the songs in the playlist
            let result = await ytlist(link, ['name', 'url']);
            result.data.playlist.forEach(songInfo => {
                links.push(songInfo.url);
            });
        } else if (link.indexOf('user') !== -1) {
            return []
        } else {
            links.push(link);
        }
        
        for (let i = 0; i < links.length; i++) {
            let link = links[i];

            // Grab the info for our one song we want to add
            let songInfo = await ytdl.getInfo(link);
            let artists = {};

            // Get the artist
            if (songInfo.videoDetails.media.artist) {
                let newArtists = songInfo.videoDetails.media.artist.split(',');
                newArtists.forEach(artist => {
                    artist = artist.trim();

                    artists[artist] = artists[artist] ? artists[artist] + 1 : 1;
                })
            }

            songs.push({
                title: songInfo.videoDetails.title,
                url: songInfo.videoDetails.video_url,
                thumbnail: songInfo.videoDetails.thumbnails.length > 0 ? songInfo.videoDetails.thumbnails[0].url : null,
                artists: artists,
                type: this.getName()
            });
        };

        return songs;
    }

    public async getStream(url) {
        let stream = await ytdl(url, {
            highWaterMark: 2500000,
            filter: 'audioandvideo',
            range: { start: 0 }, 
            requestOptions: {
                headers: {
                    'Cookie': process.env.YOUTUBE_COOKIE
                }
            }
        });

        return { stream: stream, type: 'opus' };
    }

    public async getNext(url, lastPlayed) {
        let songInfo = await ytdl.getInfo(url);
        let numRelated = songInfo.related_videos.length;

        if (numRelated > 0) {
            let i = 0;
            let related = null;
            let score = 1;

            while (score > MATCH_CUTOFF) {
                related = songInfo.related_videos[i]
                let relatedTitle = related.title;

                if (lastPlayed.length == 0) {
                    score = 0;
                }

                // We've tried all possible related videos and didn't find a good match! Play whatever was first
                if (i + 1 == numRelated) {
                    related = songInfo.related_videos[0];
                    break;
                }

                for (let j = 0; j < lastPlayed.length; j++) {
                    score = similar.compareTwoStrings(lastPlayed[j], relatedTitle);
                    if (score > MATCH_CUTOFF) break; // no need to compare others, too close to what we already played
                }

                i = i + 1; // in case we need to go again
            }

            let moreInfo = await ytdl.getInfo(`https://www.youtube.com/watch?v=${related.id}`);
            let artists = {};

            // Get the artist
            if (moreInfo.videoDetails.media.artist) {
                let newArtists = moreInfo.videoDetails.media.artist.split(',');
                newArtists.forEach(artist => {
                    artist = artist.trim();

                    artists[artist] = artists[artist] ? artists[artist] + 1 : 1;
                })
            }

            return {
                title: related.title,
                url: `https://www.youtube.com/watch?v=${related.id}`,
                author: related.author,
                thumbnail: moreInfo.videoDetails.thumbnails.length > 0 ? moreInfo.videoDetails.thumbnails[0].url : null,
                autoplay: true,
                artists: artists,
                type: this.getName()
            };
        } else {
            return 'No related videos available';
        }
    }
}

export default new YouTubeMusicHandler();
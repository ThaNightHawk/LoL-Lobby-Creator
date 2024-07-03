import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as readline from 'readline';
import axios from 'axios';
import * as https from 'https';

var figlet = require("figlet");

const execAsync = promisify(exec);

interface LockfileInfo {
    path: string;
    content: string;
}

figlet("Hawk's ARAM-lobbycreator!\n", function (err: any, data: any) {
    if (err) {
        console.log("Something went wrong...");
        console.dir(err);
        return;
    }
    console.log(data);
});

interface FriendsList {
    invitationId: string;
    invitationType: string;
    state: string;
    timestamp: string;
    toSummonerId: string;
    toSummonerName: string;
}

let port: number;
let password: string;
let friends: FriendsList[] = [];

// Path to the riotgames.pem certificate
const certPath = path.join(__dirname, '../certs/riotgames.pem');

// Read the certificate file
const certPromise = fs.readFile(certPath, 'utf8');



const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const lobbyJson = {
    "customGameLobby": {
        "configuration": {
            "gameMode": "ARAM",
            "gameTypeConfig": {
                "advancedLearningQuests": false,
                "allowTrades": true,
                "banMode": "SkipBanStrategy",
                "banTimerDuration": 0,
                "battleBoost": false,
                "crossTeamChampionPool": true,
                "deathMatch": false,
                "doNotRemove": false,
                "duplicatePick": true,
                "exclusivePick": false,
                "gameModeOverride": null,
                "id": 1,
                "learningQuests": false,
                "mainPickTimerDuration": 120,
                "maxAllowableBans": 0,
                "name": "GAME_CFG_PICK_BLIND",
                "numPlayersPerTeamOverride": null,
                "onboardCoopBeginner": false,
                "pickMode": "SimulPickStrategy",
                "postPickTimerDuration": 30,
                "reroll": false,
                "teamChampionPool": false
            },
            "mapId": 12,
            "maxPlayerCount": 10,
            "spectatorPolicy": "NotAllowed",
            "teamSize": 5,
            "tournamentGameMode": "",
            "tournamentPassbackDataPacket": "",
            "tournamentPassbackUrl": ""
        },
        "gameId": 0,
        "lobbyName": "ARAM Blind Pick Lobby",
        "lobbyPassword": "InsanelyStupidPassword123123123123123123123123123"
    },
    "isCustom": true,
    "queueId": 450
}

// Function to find the LeagueClient.exe path
async function findLeagueClientExe(): Promise<string | null> {
    const platform = os.platform();
    const driveLetter = 'C:';

    let searchPaths: string[];

    if (platform === 'win32') {
        searchPaths = [
            `${driveLetter}\\Riot Games\\League of Legends`,
            `${driveLetter}\\Riot Games\\LeagueClient`,
            `${driveLetter}\\Program Files\\Riot Games\\League of Legends`,
            `${driveLetter}\\Program Files (x86)\\Riot Games\\League of Legends`,
        ];
    } else {
        console.log('This script currently supports Windows only.');
        return null;
    }

    for (const basePath of searchPaths) {
        try {
            const files = await fs.readdir(basePath);
            if (files.includes('LeagueClient.exe')) {
                return path.join(basePath, 'LeagueClient.exe');
            }
        } catch (error) {
            // Ignore errors for paths that do not exist or are inaccessible
        }
    }

    try {
        const { stdout } = await execAsync(`dir ${driveLetter}\\LeagueClient.exe /s /p`);
        const lines = stdout.trim().split('\n');
        const match = lines.find(line => line.includes('LeagueClient.exe'));
        return match ? match.trim() : null;
    } catch (error) {
        console.error('Error finding LeagueClient.exe:', error);
        return null;
    }
}

// Function to locate the lockfile
async function findLockfile(leagueClientPath: string): Promise<LockfileInfo | null> {
    const lockfilePath = path.join(
        path.dirname(leagueClientPath),
        'lockfile'
    );

    try {
        const lockfileContent = await fs.readFile(lockfilePath, 'utf8');
        return { path: lockfilePath, content: lockfileContent };
    } catch (error) {
        console.error('Error finding lockfile:', error);
        return null;
    }
}

// Function to send commands to League Client
async function sendCommand(command: string): Promise<any> {
    let info: any;
    if (command === 'lol-lobby/v2/lobby') {
        info = lobbyJson;
    } else {
        info = {};
    }
    try {
        const url = `https://127.0.0.1:${port}/${command}`;
        const certData = await certPromise;
        const agent = new https.Agent({
            cert: certData,
            rejectUnauthorized: false
        });

        if (command === 'lol-lobby/v2/lobby') {
            const response = await axios.post(url, info, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${Buffer.from(`riot:${password}`).toString('base64')}`,
                },
                httpsAgent: agent,
            });
            console.log('Command sent successfully!');
            return response.data;
        }

        if (command === 'lol-summoner/v1/summoners') {
            
            rl.question('Enter a Riot#ID: ', async (input) => {

                input = encodeURIComponent(input);
                try {
                const response = await axios.get(url + '?name=' + input, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Basic ${Buffer.from(`riot:${password}`).toString('base64')}`,
                    },
                    httpsAgent: agent,
                });

                console.log('Found user:', response.data);
                await rl.question('Would you like to add this user to the friends list? (y/n): ', async (input) => {
                    if (input === 'y') {
                        friends.push({
                            invitationId: `${response.data.summonerId}`,
                            invitationType: "lobby",
                            state: "Pending",
                            timestamp: "",
                            toSummonerId: response.data.summonerId,
                            toSummonerName: response.data.gameName
                        });
                        console.log('User added to friends list!');
                        prompt();
                    } else {
                        console.log('User not added to friends list.');
                        prompt();
                    }
                });
                } catch (error) {
                    console.error('Error finding user!');
                    prompt();
                }
                return;
            });
        }

        if (command === 'lol-lobby/v2/lobby/invitations') {
            if (friends.length === 0) {
                console.log("No friends to invite. Please run the friends command first.");
                return;
            }
            for (let i = 0; i < friends.length; i++) {
                const response = await axios.post(url, friends[i], {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Basic ${Buffer.from(`riot:${password}`).toString('base64')}`,
                    },
                    httpsAgent: agent,
                });
                console.log('Invitation sent to:', friends[i].toSummonerName);
            }
            return;
        }

        if (command === 'lol-chat/v1/friends') {
            const response = await axios.get(url, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${Buffer.from(`riot:${password}`).toString('base64')}`,
                },
                httpsAgent: agent,
            });
            return response.data;
        }
    } catch (error) {
        console.error('Error sending command:', error);
    }
}

// Function to handle user commands
async function handleCommand(command: string) {
    console.log('\n########\n');
    switch (command.trim()) {
        case 'help':
            console.log('');
            console.log("Available commands: friends, create, invite, auto\n");
            console.log(`How to use:
                \n
                \n friends - Fetches the friends list and filters the friends in the group "ARAM"
                \n list - Lists the friends added to the friends list
                \n find - Finds a friend by Riot#ID and adds them to the friends list
                \n create - Creates a lobby
                \n invite - Invites the friends in the ARAM group to the lobby
                \n auto - Fetches the friends list, creates a lobby, and invites the friends in the ARAM group to the lobby
                \n
                \nMake sure to have a social-group named ARAM in the League of Legends client, otherwise this will not work.
                \n
                \n`);
            prompt();
            break;
        case 'list':
            //Print the friendslist as an array on new lines for each friend
            console.log("Friends in the friends list: ");
            for (let i = 0; i < friends.length; i++) {
                console.log(friends[i]);
            }
            prompt();
            break;
        case 'friends':
            try {
                const friendsList = await sendCommand('lol-chat/v1/friends');
                console.log("Friends in the group ARAM: ");
                for (let i = 0; i < friendsList.length; i++) {
                    if (friendsList[i].groupName === 'ARAM') {
                        friends.push({
                            invitationId: `${friendsList[i].summonerId}`,
                            invitationType: "lobby",
                            state: "Pending",
                            timestamp: "",
                            toSummonerId: friendsList[i].summonerId,
                            toSummonerName: friendsList[i].gameName
                        });
                    }
                }
                console.log(friends);
            } catch (error) {
                console.error('Error fetching friends:', error);
            }
            prompt();
            break;
        case 'find':
            await sendCommand('lol-summoner/v1/summoners')
            break;
        case 'create':
            await sendCommand('lol-lobby/v2/lobby');
            prompt();
            break;
        case 'invite':
            await sendCommand('lol-lobby/v2/lobby/invitations');
            prompt();
            break;
        case 'auto':
            await handleCommand('friends');
            await handleCommand('create');
            await handleCommand('invite');
            console.log('Good luck!');
            prompt();
            break;
        default:
            console.log('Unknown command.');
            prompt();
    }
}

function prompt() {
    rl.question('Enter a command (help, friends, list, find, create, invite, auto): ', async (input) => {
        await handleCommand(input);
    });
}

// Main function to execute the process
async function main() {
    try {
        const leagueClientPath = await findLeagueClientExe();

        if (leagueClientPath) {
            console.log(`Found LeagueClient.exe at: ${leagueClientPath}`);

            const lockfileInfo = await findLockfile(leagueClientPath);

            if (lockfileInfo) {
                console.log(`Lockfile found at: ${lockfileInfo.path}`);

                const [lockInstancee, lockProcessIdd, lockPort, lockPassword, lockProtocol] = lockfileInfo.content.split(':');

                port = parseInt(lockPort, 10);
                password = lockPassword;
                console.log("Found port and Password!");
                console.log("Port: ", lockPort);
                console.log("Password: ", lockPassword.slice(0, lockPassword.length / 4) + "*".repeat(lockPassword.length - lockPassword.length / 4) + '\n\n');

                prompt();
            } else {
                console.log('Lockfile not found.');
            }
        } else {
            console.log('LeagueClient.exe not found.');
        }
    } catch (error) {
        console.error('An unexpected error occurred:', error);
    }
}
main();
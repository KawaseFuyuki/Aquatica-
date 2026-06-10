const { Client, GatewayIntentBits, Collection, ActivityType } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Prefix
const prefix = 'aq';

// Command collection
client.commands = new Collection();

// Ready event
client.on('ready', () => {
    console.log(`${client.user.tag} is online!`);
    
    // Set bot status
    client.user.setActivity('created by kitaryo senpai', { type: ActivityType.Playing });
    
    // Register slash commands here if you have any
    console.log('Bot is ready!');
});

// Prefix command handler
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.toLowerCase().startsWith(prefix)) return;
    
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    // ===== GAMES COMMANDS =====
    if (command === 'play') {
        const game = args[0];
        if (game === 'imposter') {
            message.reply('🕵️ Find the Imposter - Coming soon! Need 4+ players');
        } else if (game === 'rps') {
            message.reply('✂️ Rock Paper Scissors - Tag someone to play!');
        } else if (game === 'rumble') {
            message.reply('💥 Rumble Battle Royale - Random elimination starting!');
        } else if (game === 'quiz') {
            const difficulty = args[1] || 'normal';
            message.reply(`🎌 Anime Quiz [${difficulty}] - 10 Questions starting!`);
        } else if (game === 'roulette') {
            message.reply('🔫 Russian Roulette - 2-6 players, 1 bullet. Who survives?');
        } else if (game === 'hangman') {
            message.reply('🎮 Anime Hangman - Guess the character! You have 7 lives');
        } else if (game === 'bomb') {
            message.reply('💣 Number Bomb - Add 1-3, don\'t hit the bomb!');
        } else {
            message.reply('Available games: imposter, rps, rumble, quiz, roulette, hangman, bomb');
        }
    }
    
    // ===== HANGMAN GUESS =====
    else if (command === 'guess' || command === 'g') {
        const letter = args[0];
        message.reply(`You guessed: ${letter} - Hangman logic here`);
    }
    
    // ===== GENERAL =====
    else if (command === 'ping') {
        const ping = Date.now() - message.createdTimestamp;
        message.reply(`🏓 Pong! Bot Latency: ${ping}ms | WebSocket: ${client.ws.ping}ms`);
    }
    else if (command === 'av' || command === 'avatar') {
        const user = message.mentions.users.first() || message.author;
        message.reply(user.displayAvatarURL({ dynamic: true, size: 1024 }));
    }
    else if (command === 'help') {
        message.reply('Use `aq help` or `/` for slash commands. Check bot embed for full list!');
    }
    
    // ===== MODERATION =====
    else if (command === 'ban') {
        if (!message.member.permissions.has('BanMembers')) return message.reply('No permission!');
        const user = message.mentions.users.first();
        const reason = args.slice(1).join(' ') || 'No reason';
        message.reply(`Banned ${user.tag} | Reason: ${reason}`);
    }
    else if (command === 'mute') {
        if (!message.member.permissions.has('ModerateMembers')) return message.reply('No permission!');
        const user = message.mentions.users.first();
        const duration = args[1] || '10m';
        message.reply(`Muted ${user.tag} for ${duration}`);
    }
    else if (command === 'warn') {
        if (!message.member.permissions.has('ManageMessages')) return message.reply('No permission!');
        const user = message.mentions.users.first();
        const reason = args.slice(1).join(' ') || 'No reason';
        message.reply(`Warned ${user.tag} | Reason: ${reason}`);
    }
});

// Slash command handler - add your slash commands here
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    
    if (interaction.commandName === 'ping') {
        await interaction.reply(`🏓 Pong! ${client.ws.ping}ms`);
    }
});

// Login
client.login(process.env.TOKEN);

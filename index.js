const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Dummy web server for Render - bot ko online rakhne ke liye
app.get('/', (req, res) => res.send('AquaBot is running!'));
app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const prefix = 'aq';

client.on('ready', () => {
    console.log(`${client.user.tag} is online!`);
    client.user.setActivity('created by kitaryo senpai', { type: ActivityType.Playing });
    console.log('Bot is ready!');
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.toLowerCase().startsWith(prefix)) return;
    
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    if (command === 'play') {
        const game = args[0];
        if (game === 'imposter') {
            message.reply('🕵️ Find the Imposter - 4+ players, DM roles, vote system!');
        } else if (game === 'rps') {
            message.reply('✂️ Rock Paper Scissors - Tag someone to play! 20s timer');
        } else if (game === 'rumble') {
            message.reply('💥 Rumble Battle Royale - Random elimination started!');
        } else if (game === 'quiz') {
            const difficulty = args[1] || 'normal';
            message.reply(`🎌 Anime Quiz [${difficulty}] - 10 Questions! Naruto, DBZ, Demon Slayer & more`);
        } else if (game === 'roulette') {
            message.reply('🔫 Russian Roulette - 2-6 players, 1 bullet, survive!');
        } else if (game === 'hangman') {
            message.reply('🎮 Anime Hangman - Guess the character! 7 lives, 60 anime chars');
        } else if (game === 'bomb') {
            message.reply('💣 Number Bomb - Add 1-3, don\'t hit the bomb!');
        } else {
            message.reply('**Games:** imposter, rps, rumble, quiz, roulette, hangman, bomb');
        }
    }
    else if (command === 'guess' || command === 'g') {
        const letter = args[0];
        if (!letter) return message.reply('Letter batao bhai! `aq g a`');
        message.reply(`You guessed: ${letter}`);
    }
    else if (command === 'ping') {
        message.reply(`🏓 Pong! Latency: ${Date.now() - message.createdTimestamp}ms | API: ${client.ws.ping}ms`);
    }
    else if (command === 'av' || command === 'avatar') {
        const user = message.mentions.users.first() || message.author;
        message.reply(user.displayAvatarURL({ dynamic: true, size: 1024 }));
    }
    else if (command === 'help') {
        message.reply('**AquaBot Commands**\nPrefix: `aq` or `Aq`\n`aq play <game>` - Play games\n`aq ping` - Check ping\n`aq av @user` - Avatar\nUse `/` for slash commands');
    }
    else if (command === 'ban') {
        if (!message.member.permissions.has('BanMembers')) return message.reply('❌ No Ban Members permission!');
        const user = message.mentions.users.first();
        if (!user) return message.reply('User mention karo!');
        const reason = args.slice(1).join(' ') || 'No reason provided';
        message.reply(`🔨 Banned ${user.tag} | Reason: ${reason}`);
    }
    else if (command === 'mute') {
        if (!message.member.permissions.has('ModerateMembers')) return message.reply('❌ No Moderate Members permission!');
        const user = message.mentions.users.first();
        const duration = args[1] || '10m';
        message.reply(`🔇 Muted ${user.tag} for ${duration}`);
    }
    else if (command === 'warn') {
        if (!message.member.permissions.has('ManageMessages')) return message.reply('❌ No Manage Messages permission!');
        const user = message.mentions.users.first();
        const reason = args.slice(1).join(' ') || 'No reason';
        message.reply(`⚠️ Warned ${user.tag} | Reason: ${reason}`);
    }
    else if (command === 'unban') {
        if (!message.member.permissions.has('BanMembers')) return message.reply('❌ No permission!');
        const userId = args[0];
        message.reply(`✅ Unbanned user ID: ${userId}`);
    }
    else if (command === 'unmute') {
        if (!message.member.permissions.has('ModerateMembers')) return message.reply('❌ No permission!');
        const user = message.mentions.users.first();
        message.reply(`🔊 Unmuted ${user.tag}`);
    }
    else if (command === 'clearwarns') {
        if (!message.member.permissions.has('ManageMessages')) return message.reply('❌ No permission!');
        const user = message.mentions.users.first();
        message.reply(`✅ Cleared all warnings for ${user.tag}`);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'ping') {
        await interaction.reply(`🏓 Pong! ${client.ws.ping}ms`);
    }
});

client.login(process.env.TOKEN);
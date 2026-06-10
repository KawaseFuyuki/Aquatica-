const { Client, GatewayIntentBits, ActivityType, EmbedBuilder } = require('discord.js');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
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
const BLUE = 0x3498DB;

// ===== GAME STORAGE =====
const games = {
    imposter: {},
    rps: {},
    rumble: {},
    quiz: {},
    roulette: {},
    hangman: {},
    bomb: {}
};

const animeChars = ['naruto', 'goku', 'luffy', 'ichigo', 'eren', 'tanjiro', 'gojo', 'itachi', 'zoro', 'levi', 'killua', 'deku', 'saitama', 'sasuke', 'kakashi'];
const quizQuestions = [
    { q: 'Who is the 9-Tails jinchuriki in Naruto?', a: ['naruto', 'naruto uzumaki'] },
    { q: 'Who is the Straw Hat captain in One Piece?', a: ['luffy', 'monkey d luffy'] },
    { q: 'Who is the main character in Demon Slayer?', a: ['tanjiro', 'tanjiro kamado'] },
    { q: 'Who is the MC of Attack on Titan?', a: ['eren', 'eren yeager'] },
    { q: 'Who is Goku\'s son in Dragon Ball?', a: ['gohan', 'gohan'] }
];

client.on('ready', () => {
    console.log(`${client.user.tag} is online!`);
    client.user.setActivity('created by kitaryo senpai', { type: ActivityType.Playing });
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.toLowerCase().startsWith(prefix)) return;
    
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const channelId = message.channel.id;

    // ===== PLAY COMMAND =====
    if (command === 'play') {
        const game = args[0];
        
        // IMPOSTER
        if (game === 'imposter') {
            if (games.imposter[channelId]) return message.reply('Game already running in this channel!');
            const embed = new EmbedBuilder()
                .setColor(BLUE)
                .setTitle('🕵️ Find the Imposter')
                .setDescription('React with ✅ to join! Minimum 4 players needed. Starting in 20s')
                .setFooter({ text: 'Type aq startimposter to begin early' });
            const msg = await message.channel.send({ embeds: [embed] });
            await msg.react('✅');
            games.imposter[channelId] = { players: [], started: false, msg };
        }
        
        // RPS
        else if (game === 'rps') {
            const opponent = message.mentions.users.first();
            if (!opponent) return message.reply('Mention someone to challenge! `aq play rps @user`');
            if (opponent.bot) return message.reply('You cannot play against bots!');
            const embed = new EmbedBuilder()
                .setColor(BLUE)
                .setTitle('✂️ Rock Paper Scissors')
                .setDescription(`${message.author} vs ${opponent}\nBoth players check your DMs! Send r/p/s within 20s`);
            message.channel.send({ embeds: [embed] });
            games.rps[channelId] = { p1: message.author.id, p2: opponent.id, p1Choice: null, p2Choice: null };
            message.author.send('Choose: `r` for rock, `p` for paper, `s` for scissors');
            opponent.send('Choose: `r` for rock, `p` for paper, `s` for scissors');
            setTimeout(() => {
                if (games.rps[channelId] && (!games.rps[channelId].p1Choice || !games.rps[channelId].p2Choice)) {
                    message.channel.send('⏰ Time up! Game cancelled due to inactivity.');
                    delete games.rps[channelId];
                }
            }, 20000);
        }
        
        // RUMBLE
        else if (game === 'rumble') {
            const embed = new EmbedBuilder()
                .setColor(BLUE)
                .setTitle('💥 Rumble Battle Royale')
                .setDescription('React with ⚔️ to join! Starting in 15s');
            const msg = await message.channel.send({ embeds: [embed] });
            await msg.react('⚔️');
            games.rumble[channelId] = { players: [], started: false };
            setTimeout(async () => {
                const users = await msg.reactions.cache.get('⚔️').users.fetch();
                const players = users.filter(u => !u.bot).map(u => u.id);
                if (players.length < 2) return message.channel.send('Minimum 2 players required!');
                games.rumble[channelId].players = players;
                runRumble(message.channel, players);
            }, 15000);
        }
        
        // QUIZ
        else if (game === 'quiz') {
            if (games.quiz[channelId]) return message.reply('Quiz already running in this channel!');
            games.quiz[channelId] = { score: {}, currentQ: 0, questions: quizQuestions.sort(() => 0.5 - Math.random()).slice(0, 5) };
            sendQuizQuestion(message.channel);
        }
        
        // ROULETTE
        else if (game === 'roulette') {
            const embed = new EmbedBuilder()
                .setColor(BLUE)
                .setTitle('🔫 Russian Roulette')
                .setDescription('React with 🎯 to join! 2-6 players. Starting in 15s');
            const msg = await message.channel.send({ embeds: [embed] });
            await msg.react('🎯');
            setTimeout(async () => {
                const users = await msg.reactions.cache.get('🎯').users.fetch();
                const players = users.filter(u => !u.bot).map(u => u.id);
                if (players.length < 2) return message.channel.send('Minimum 2 players required!');
                games.roulette[channelId] = { players, bullet: Math.floor(Math.random() * 6), current: 0 };
                message.channel.send(`Game started! <@${players[0]}> type \`aq shoot\` to pull the trigger`);
            }, 15000);
        }
        
        // HANGMAN
        else if (game === 'hangman') {
            if (games.hangman[channelId]) return message.reply('Hangman already running in this channel!');
            const word = animeChars[Math.floor(Math.random() * animeChars.length)];
            games.hangman[channelId] = {
                word,
                guessed: [],
                lives: 7,
                display: word.split('').map(() => '_').join(' ')
            };
            const embed = new EmbedBuilder()
                .setColor(BLUE)
                .setTitle('🎮 Anime Hangman')
                .setDescription(`Word: \`${games.hangman[channelId].display}\`\nLives: ❤️❤️❤️❤️❤️❤️❤️\nGuess with: \`aq g <letter>\``);
            message.channel.send({ embeds: [embed] });
        }
        
        // BOMB
        else if (game === 'bomb') {
            if (games.bomb[channelId]) return message.reply('Bomb game already running in this channel!');
            games.bomb[channelId] = { number: 0, bomb: Math.floor(Math.random() * 21) + 20, turn: message.author.id };
            const embed = new EmbedBuilder()
                .setColor(BLUE)
                .setTitle('💣 Number Bomb')
                .setDescription(`Current: 0 | Bomb is between 20-40\n<@${message.author.id}>'s turn! Add 1-3: \`aq add <1-3>\``);
            message.channel.send({ embeds: [embed] });
        }
        
        else {
            const embed = new EmbedBuilder()
                .setColor(BLUE)
                .setTitle('🎮 AquaBot Games')
                .setDescription('**Available Games:**\nimposter, rps, rumble, quiz, roulette, hangman, bomb\n\nUsage: `aq play <game>`');
            message.reply({ embeds: [embed] });
        }
    }
    
    // ===== GAME COMMANDS =====
    else if (command === 'startimposter' && games.imposter[channelId]) {
        const msg = games.imposter[channelId].msg;
        const users = await msg.reactions.cache.get('✅').users.fetch();
        const players = users.filter(u => !u.bot);
        if (players.size < 4) return message.reply('Minimum 4 players required!');
        const imposter = players.random();
        players.forEach(p => {
            const role = p.id === imposter.id ? 'IMPOSTER 🕵️' : 'CREWMATE 👨‍🚀';
            p.send(`Your role: **${role}**`);
        });
        const embed = new EmbedBuilder().setColor(BLUE).setDescription(`Game started! ${players.size} players. Check your DMs for your role. Discuss and vote with \`aq vote @user\``);
        message.channel.send({ embeds: [embed] });
        games.imposter[channelId].started = true;
    }
    
    else if (command === 'shoot' && games.roulette[channelId]) {
        const game = games.roulette[channelId];
        if (message.author.id !== game.players[game.current]) return message.reply('It is not your turn!');
        if (game.current === game.bullet) {
            const embed = new EmbedBuilder().setColor(BLUE).setTitle('💥 BANG!').setDescription(`${message.author} got shot! Game over.`);
            message.channel.send({ embeds: [embed] });
            delete games.roulette[channelId];
        } else {
            game.current++;
            const embed = new EmbedBuilder().setColor(BLUE).setDescription(`*click* Empty chamber! <@${game.players[game.current % game.players.length]}>'s turn`);
            message.channel.send({ embeds: [embed] });
            game.current = game.current % game.players.length;
        }
    }
    
    else if ((command === 'g' || command === 'guess') && games.hangman[channelId]) {
        const letter = args[0]?.toLowerCase();
        if (!letter || letter.length !== 1) return message.reply('Please send one letter! `aq g a`');
        const game = games.hangman[channelId];
        if (game.guessed.includes(letter)) return message.reply('You already guessed that letter!');
        game.guessed.push(letter);
        if (game.word.includes(letter)) {
            game.display = game.word.split('').map(l => game.guessed.includes(l) ? l : '_').join(' ');
            if (!game.display.includes('_')) {
                const embed = new EmbedBuilder().setColor(BLUE).setTitle('🎉 You Won!').setDescription(`The word was: **${game.word}**`);
                message.channel.send({ embeds: [embed] });
                delete games.hangman[channelId];
                return;
            }
        } else {
            game.lives--;
            if (game.lives === 0) {
                const embed = new EmbedBuilder().setColor(BLUE).setTitle('💀 Game Over').setDescription(`The word was: **${game.word}**`);
                message.channel.send({ embeds: [embed] });
                delete games.hangman[channelId];
                return;
            }
        }
        const embed = new EmbedBuilder()
            .setColor(BLUE)
            .setTitle('🎮 Anime Hangman')
            .setDescription(`Word: \`${game.display}\`\nLives: ${'❤️'.repeat(game.lives)}\nGuessed: ${game.guessed.join(', ')}`);
        message.channel.send({ embeds: [embed] });
    }
    
    else if (command === 'add' && games.bomb[channelId]) {
        const game = games.bomb[channelId];
        if (message.author.id !== game.turn) return message.reply('It is not your turn!');
        const num = parseInt(args[0]);
        if (![1,2,3].includes(num)) return message.reply('You can only add 1, 2, or 3!');
        game.number += num;
        if (game.number >= game.bomb) {
            const embed = new EmbedBuilder().setColor(BLUE).setTitle('💥 BOOM!').setDescription(`${message.author} hit the bomb at ${game.number}! Game over.`);
            message.channel.send({ embeds: [embed] });
            delete games.bomb[channelId];
        } else {
            const embed = new EmbedBuilder().setColor(BLUE).setDescription(`Current: ${game.number} | Bomb: 20-40\nNext player's turn!`);
            message.channel.send({ embeds: [embed] });
        }
    }
    
    else if (command === 'answer' && games.quiz[channelId]) {
        const answer = args.join(' ').toLowerCase();
        const game = games.quiz[channelId];
        const correct = game.questions[game.currentQ].a.includes(answer);
        if (correct) {
            game.score[message.author.id] = (game.score[message.author.id] || 0) + 1;
            message.channel.send(`✅ Correct! <@${message.author.id}> +1 point`);
        }
        game.currentQ++;
        if (game.currentQ >= game.questions.length) endQuiz(message.channel, game);
        else setTimeout(() => sendQuizQuestion(message.channel), 2000);
    }
    
    // ===== BASIC COMMANDS =====
    else if (command === 'ping') {
        const embed = new EmbedBuilder().setColor(BLUE).setDescription(`🏓 Pong! Latency: ${Date.now() - message.createdTimestamp}ms | API: ${client.ws.ping}ms`);
        message.reply({ embeds: [embed] });
    }
    else if (command === 'av' || command === 'avatar') {
        const user = message.mentions.users.first() || message.author;
        const embed = new EmbedBuilder().setColor(BLUE).setTitle(`${user.username}'s Avatar`).setImage(user.displayAvatarURL({ dynamic: true, size: 1024 }));
        message.reply({ embeds: [embed] });
    }
    else if (command === 'help') {
        const embed = new EmbedBuilder()
            .setColor(BLUE)
            .setTitle('AquaBot Commands')
            .setDescription('**Prefix:** `aq`\n**Games:** imposter, rps, rumble, quiz, roulette, hangman, bomb\n**Usage:** `aq play <game>`\n**Other:** ping, av, ban, mute, warn')
            .setFooter({ text: 'created by kitaryo senpai' });
        message.reply({ embeds: [embed] });
    }
    
    // ===== MODERATION =====
    else if (command === 'ban') {
        if (!message.member.permissions.has('BanMembers')) return message.reply('❌ You do not have permission to ban members!');
        const user = message.mentions.users.first();
        if (!user) return message.reply('Please mention a user to ban!');
        const reason = args.slice(1).join(' ') || 'No reason provided';
        const embed = new EmbedBuilder().setColor(BLUE).setDescription(`🔨 Banned ${user.tag} | Reason: ${reason}`);
        message.reply({ embeds: [embed] });
    }
    else if (command === 'mute') {
        if (!message.member.permissions.has('ModerateMembers')) return message.reply('❌ You do not have permission to mute members!');
        const user = message.mentions.users.first();
        const duration = args[1] || '10m';
        const embed = new EmbedBuilder().setColor(BLUE).setDescription(`🔇 Muted ${user.tag} for ${duration}`);
        message.reply({ embeds: [embed] });
    }
    else if (command === 'warn') {
        if (!message.member.permissions.has('ManageMessages')) return message.reply('❌ You do not have permission to warn members!');
        const user = message.mentions.users.first();
        const reason = args.slice(1).join(' ') || 'No reason provided';
        const embed = new EmbedBuilder().setColor(BLUE).setDescription(`⚠️ Warned ${user.tag} | Reason: ${reason}`);
        message.reply({ embeds: [embed] });
    }
});

// DM Handler for RPS
client.on('messageCreate', async message => {
    if (message.channel.type !== 1 || message.author.bot) return;
    const choice = message.content.toLowerCase();
    if (!['r','p','s'].includes(choice)) return;
    
    for (const channelId in games.rps) {
        const game = games.rps[channelId];
        if (game.p1 === message.author.id) game.p1Choice = choice;
        if (game.p2 === message.author.id) game.p2Choice = choice;
        
        if (game.p1Choice && game.p2Choice) {
            const channel = await client.channels.fetch(channelId);
            const winner = getRPSWinner(game.p1Choice, game.p2Choice);
            let result;
            if (winner === 0) result = "It's a tie!";
            else if (winner === 1) result = `<@${game.p1}> wins!`;
            else result = `<@${game.p2}> wins!`;
            const embed = new EmbedBuilder().setColor(BLUE).setTitle('✂️ RPS Result').setDescription(`<@${game.p1}>: ${game.p1Choice.toUpperCase()}\n<@${game.p2}>: ${game.p2Choice.toUpperCase()}\n\n${result}`);
            channel.send({ embeds: [embed] });
            delete games.rps[channelId];
        }
    }
});

function getRPSWinner(p1, p2) {
    if (p1 === p2) return 0;
    if ((p1 === 'r' && p2 === 's') || (p1 === 'p' && p2 === 'r') || (p1 === 's' && p2 === 'p')) return 1;
    return 2;
}

function sendQuizQuestion(channel) {
    const game = games.quiz[channel.id];
    const q = game.questions[game.currentQ];
    const embed = new EmbedBuilder().setColor(BLUE).setTitle(`🎌 Anime Quiz Q${game.currentQ + 1}/5`).setDescription(`${q.q}\n\nAnswer with: \`aq answer <your answer>\``);
    channel.send({ embeds: [embed] });
}

function endQuiz(channel, game) {
    const sorted = Object.entries(game.score).sort((a,b) => b[1] - a[1]);
    let desc = '**Final Scores:**\n';
    sorted.forEach(([id, score], i) => desc += `${i+1}. <@${id}> - ${score} pts\n`);
    const embed = new EmbedBuilder().setColor(BLUE).setTitle('🏆 Quiz Over!').setDescription(desc || 'No one scored!');
    channel.send({ embeds: [embed] });
    delete games.quiz[channel.id];
}

async function runRumble(channel, players) {
    const embed = new EmbedBuilder().setColor(BLUE).setTitle('💥 Rumble Started!').setDescription(`Players: ${players.map(p => `<@${p}>`).join(', ')}\nEliminations starting...`);
    await channel.send({ embeds: [embed] });
    while (players.length > 1) {
        await new Promise(r => setTimeout(r, 3000));
        const eliminated = players.splice(Math.floor(Math.random() * players.length), 1)[0];
        const embed = new EmbedBuilder().setColor(BLUE).setDescription(`💀 <@${eliminated}> was eliminated! ${players.length} remaining`);
        await channel.send({ embeds: [embed] });
    }
    const embed = new EmbedBuilder().setColor(BLUE).setTitle('👑 WINNER!').setDescription(`<@${players[0]}> wins the Rumble!`);
    channel.send({ embeds: [embed] });
    delete games.rumble[channel.id];
}

client.login(process.env.TOKEN);

import {
  Client,
  GatewayIntentBits,
  ActivityType,
  REST,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import http from 'http';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const BLUE = 0x0099ff;
const PREFIX_RE = /^[Aa][Qq] +/;
const STATUS = 'created by kitaryo senpai';

function gameKey(guildId, channelId) {
  return `${guildId}:${channelId}`;
}

// ─── SLASH COMMANDS ───────────────────────────────────────────────────────────

const slashCommands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Start a mini-game!')
    .addStringOption(opt =>
      opt.setName('game').setDescription('Which game to play').setRequired(true)
        .addChoices(
          { name: '🕵️ Find the Imposter', value: 'imposter' },
          { name: '✂️ Rock Paper Scissors', value: 'rps' },
          { name: '💥 Rumble Battle Royale', value: 'rumble' },
          { name: '🎌 Anime Quiz', value: 'quiz' },
          { name: '🔫 Russian Roulette', value: 'roulette' },
          { name: '🎮 Anime Hangman', value: 'hangman' },
          { name: '💣 Number Bomb', value: 'bomb' },
        )
    )
    .addStringOption(opt =>
      opt.setName('difficulty').setDescription('Quiz difficulty (only for quiz game)')
        .addChoices(
          { name: '🟢 Easy', value: 'easy' },
          { name: '🟡 Normal', value: 'normal' },
          { name: '🔴 Hard', value: 'hard' },
          { name: '💀 Extreme', value: 'extreme' },
        )
    ),
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency and WebSocket ping'),
  new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Show a user\'s avatar')
    .addUserOption(opt => opt.setName('user').setDescription('The user (default: you)')),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all AquaBot commands'),
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(opt => opt.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for ban')),
  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user by their ID')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(opt => opt.setName('userid').setDescription('User ID to unban').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for unban')),
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Timeout (mute) a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(opt => opt.setName('user').setDescription('User to mute').setRequired(true))
    .addStringOption(opt => opt.setName('duration').setDescription('Duration e.g. 10m, 1h, 1d (default 10m)'))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for mute')),
  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Remove timeout from a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(opt => opt.setName('user').setDescription('User to unmute').setRequired(true)),
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption(opt => opt.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason for warning')),
  new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Clear all warnings for a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption(opt => opt.setName('user').setDescription('User to clear warns for').setRequired(true)),
].map(cmd => cmd.toJSON());

// ─── MODERATION ───────────────────────────────────────────────────────────────

const warnStore = new Map();

function getWarns(guildId, userId) {
  if (!warnStore.has(guildId)) warnStore.set(guildId, new Map());
  return warnStore.get(guildId).get(userId) ?? [];
}
function addWarn(guildId, userId, reason) {
  if (!warnStore.has(guildId)) warnStore.set(guildId, new Map());
  const map = warnStore.get(guildId);
  const existing = map.get(userId) ?? [];
  map.set(userId, [...existing, reason]);
}
function clearWarns(guildId, userId) {
  warnStore.get(guildId)?.delete(userId);
}

function parseDuration(str) {
  const match = str.match(/^(\d+)([smhd])$/i);
  if (!match) return null;
  const n = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return n * (multipliers[unit] ?? 0);
}

function errEmbed(msg) {
  return new EmbedBuilder().setColor(BLUE).setDescription(`❌ ${msg}`);
}
function successEmbed(title, desc) {
  return new EmbedBuilder().setColor(BLUE).setTitle(title).setDescription(desc);
}

async function replyEmbed(source, embeds) {
  if (source.isCommand?.() || source.isChatInputCommand?.()) {
    await source.reply({ embeds });
  } else {
    await source.reply({ embeds });
  }
}

async function handleBan(source, args) {
  const guild = source.guild;
  const executor = source.member;
  if (!guild) { await replyEmbed(source, [errEmbed('This command must be used in a server.')]); return; }
  if (!executor.permissions.has(PermissionFlagsBits.BanMembers)) {
    await replyEmbed(source, [errEmbed('You need **Ban Members** permission.')]); return;
  }
  let target = null;
  let reason = 'No reason provided';
  if (source.mentions) {
    target = source.mentions.members?.first() ?? null;
    reason = args.slice(1).join(' ') || reason;
  } else {
    const user = source.options.getUser('user', true);
    target = await guild.members.fetch(user.id).catch(() => null);
    reason = source.options.getString('reason') ?? reason;
  }
  if (!target) { await replyEmbed(source, [errEmbed('Please mention a valid user.')]); return; }
  if (!target.bannable) { await replyEmbed(source, [errEmbed('I cannot ban that user. They may have a higher role.')]); return; }
  await target.ban({ reason });
  await replyEmbed(source, [successEmbed('🔨 User Banned', `**${target.displayName}** has been banned.\n**Reason:** ${reason}`)]);
}

async function handleUnban(source, args) {
  const guild = source.guild;
  const executor = source.member;
  if (!guild) { await replyEmbed(source, [errEmbed('This command must be used in a server.')]); return; }
  if (!executor.permissions.has(PermissionFlagsBits.BanMembers)) {
    await replyEmbed(source, [errEmbed('You need **Ban Members** permission.')]); return;
  }
  let userId;
  let reason = 'No reason provided';
  if (source.mentions) {
    userId = args[0] ?? '';
    reason = args.slice(1).join(' ') || reason;
  } else {
    userId = source.options.getString('userid', true);
    reason = source.options.getString('reason') ?? reason;
  }
  if (!userId) { await replyEmbed(source, [errEmbed('Please provide a valid User ID.')]); return; }
  try {
    await guild.members.unban(userId, reason);
    await replyEmbed(source, [successEmbed('✅ User Unbanned', `User **${userId}** has been unbanned.\n**Reason:** ${reason}`)]);
  } catch {
    await replyEmbed(source, [errEmbed('Could not unban that user. They may not be banned or the ID is invalid.')]);
  }
}

async function handleMute(source, args) {
  const guild = source.guild;
  const executor = source.member;
  if (!guild) { await replyEmbed(source, [errEmbed('This command must be used in a server.')]); return; }
  if (!executor.permissions.has(PermissionFlagsBits.ModerateMembers)) {
    await replyEmbed(source, [errEmbed('You need **Moderate Members** permission.')]); return;
  }
  let target = null;
  let durationMs = 10 * 60 * 1000;
  let reason = 'No reason provided';
  if (source.mentions) {
    target = source.mentions.members?.first() ?? null;
    const durationArg = args[1];
    if (durationArg) {
      const parsed = parseDuration(durationArg);
      if (parsed) { durationMs = parsed; reason = args.slice(2).join(' ') || reason; }
      else { reason = args.slice(1).join(' ') || reason; }
    }
  } else {
    const user = source.options.getUser('user', true);
    target = await guild.members.fetch(user.id).catch(() => null);
    const durStr = source.options.getString('duration');
    if (durStr) { const p = parseDuration(durStr); if (p) durationMs = p; }
    reason = source.options.getString('reason') ?? reason;
  }
  if (!target) { await replyEmbed(source, [errEmbed('Please mention a valid user.')]); return; }
  if (!target.moderatable) { await replyEmbed(source, [errEmbed('I cannot mute that user. They may have a higher role.')]); return; }
  await target.timeout(durationMs, reason);
  const durationStr = durationMs >= 3_600_000
    ? `${Math.round(durationMs / 3_600_000)}h`
    : `${Math.round(durationMs / 60_000)}m`;
  await replyEmbed(source, [successEmbed('🔇 User Muted', `**${target.displayName}** has been muted for **${durationStr}**.\n**Reason:** ${reason}`)]);
}

async function handleUnmute(source, args) {
  const guild = source.guild;
  const executor = source.member;
  if (!guild) { await replyEmbed(source, [errEmbed('This command must be used in a server.')]); return; }
  if (!executor.permissions.has(PermissionFlagsBits.ModerateMembers)) {
    await replyEmbed(source, [errEmbed('You need **Moderate Members** permission.')]); return;
  }
  let target = null;
  if (source.mentions) {
    target = source.mentions.members?.first() ?? null;
  } else {
    const user = source.options.getUser('user', true);
    target = await guild.members.fetch(user.id).catch(() => null);
  }
  if (!target) { await replyEmbed(source, [errEmbed('Please mention a valid user.')]); return; }
  if (!target.moderatable) { await replyEmbed(source, [errEmbed('I cannot unmute that user.')]); return; }
  await target.timeout(null);
  await replyEmbed(source, [successEmbed('🔊 User Unmuted', `**${target.displayName}**'s timeout has been removed.`)]);
}

async function handleWarn(source, args) {
  const guild = source.guild;
  const executor = source.member;
  if (!guild) { await replyEmbed(source, [errEmbed('This command must be used in a server.')]); return; }
  if (!executor.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await replyEmbed(source, [errEmbed('You need **Manage Messages** permission.')]); return;
  }
  let target = null;
  let reason = 'No reason provided';
  if (source.mentions) {
    target = source.mentions.members?.first() ?? null;
    reason = args.slice(1).join(' ') || reason;
  } else {
    const user = source.options.getUser('user', true);
    target = await guild.members.fetch(user.id).catch(() => null);
    reason = source.options.getString('reason') ?? reason;
  }
  if (!target) { await replyEmbed(source, [errEmbed('Please mention a valid user.')]); return; }
  addWarn(guild.id, target.id, reason);
  const totalWarns = getWarns(guild.id, target.id).length;
  await replyEmbed(source, [successEmbed('⚠️ User Warned', `**${target.displayName}** has been warned.\n**Reason:** ${reason}\n**Total Warnings:** ${totalWarns}`)]);
}

async function handleClearWarns(source, args) {
  const guild = source.guild;
  const executor = source.member;
  if (!guild) { await replyEmbed(source, [errEmbed('This command must be used in a server.')]); return; }
  if (!executor.permissions.has(PermissionFlagsBits.ManageMessages)) {
    await replyEmbed(source, [errEmbed('You need **Manage Messages** permission.')]); return;
  }
  let target = null;
  if (source.mentions) {
    target = source.mentions.members?.first() ?? null;
  } else {
    const user = source.options.getUser('user', true);
    target = await guild.members.fetch(user.id).catch(() => null);
  }
  if (!target) { await replyEmbed(source, [errEmbed('Please mention a valid user.')]); return; }
  const before = getWarns(guild.id, target.id).length;
  clearWarns(guild.id, target.id);
  await replyEmbed(source, [successEmbed('✅ Warnings Cleared', `Cleared **${before}** warning(s) for **${target.displayName}**.`)]);
}

// ─── GENERAL COMMANDS ─────────────────────────────────────────────────────────

async function handleAvatar(source, args) {
  let targetUser;
  if (source.mentions) {
    targetUser = source.mentions.users.first() ?? source.author;
  } else {
    targetUser = source.options.getUser('user') ?? source.user;
  }
  const guild = source.guild;
  let avatarUrl = targetUser.displayAvatarURL({ size: 512 });
  let displayName = targetUser.username;
  if (guild) {
    const member = await guild.members.fetch(targetUser.id).catch(() => null);
    if (member) {
      avatarUrl = member.displayAvatarURL({ size: 512 }) ?? avatarUrl;
      displayName = member.displayName;
    }
  }
  const embed = new EmbedBuilder()
    .setColor(BLUE)
    .setTitle(`🖼️ Avatar — ${displayName}`)
    .setImage(avatarUrl)
    .setFooter({ text: `Requested by ${source.mentions ? source.author.username : source.user.username}` });
  await source.reply({ embeds: [embed] });
}

async function handlePing(source, client) {
  const wsPing = Math.round(client.ws.ping);
  if (source.mentions) {
    const sent = await source.reply({
      embeds: [new EmbedBuilder().setColor(BLUE).setDescription('🏓 Pinging...')],
    });
    const roundtrip = sent.createdTimestamp - source.createdTimestamp;
    await sent.edit({
      embeds: [
        new EmbedBuilder()
          .setColor(BLUE)
          .setTitle('🏓 Pong!')
          .addFields(
            { name: '↩️ Roundtrip', value: `\`${roundtrip}ms\``, inline: true },
            { name: '💓 WebSocket', value: `\`${wsPing}ms\``, inline: true },
          )
          .setFooter({ text: 'created by kitaryo senpai' }),
      ],
    });
  } else {
    const before = Date.now();
    await source.reply({
      embeds: [new EmbedBuilder().setColor(BLUE).setDescription('🏓 Pinging...')],
    });
    const roundtrip = Date.now() - before;
    await source.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(BLUE)
          .setTitle('🏓 Pong!')
          .addFields(
            { name: '↩️ Roundtrip', value: `\`${roundtrip}ms\``, inline: true },
            { name: '💓 WebSocket', value: `\`${wsPing}ms\``, inline: true },
          )
          .setFooter({ text: 'created by kitaryo senpai' }),
      ],
    });
  }
}

async function handleHelp(source) {
  const embed = new EmbedBuilder()
    .setColor(BLUE)
    .setTitle('📖 AquaBot — Command Help')
    .setDescription('Use prefix **aq** or **Aq** OR slash commands `/`')
    .addFields(
      {
        name: '🎮 Games (7 Mini-Games!)',
        value: [
          '`aq play imposter` — 🕵️ Find the Imposter (4+ players, DM roles, vote)',
          '`aq play rps` — ✂️ Rock Paper Scissors (2 players, 20s timer)',
          '`aq play rumble` — 💥 Rumble Battle Royale (random elimination)',
          '`aq play quiz [easy/normal/hard/extreme]` — 🎌 Anime Quiz (10 Qs, ratings)',
          '`aq play roulette` — 🔫 Russian Roulette (2–6 players, 1 bullet, survive!)',
          '`aq play hangman` — 🎮 Anime Hangman (guess the character, 7 lives)',
          '`aq play bomb` — 💣 Number Bomb (add 1–3, don\'t hit the bomb!)',
        ].join('\n'),
      },
      {
        name: '🎮 Hangman',
        value: '`aq guess <letter>` or `aq g <letter>` — Guess a letter in Hangman\n60 anime characters across Naruto, DBZ, Demon Slayer, JJK, AOT & more!',
      },
      {
        name: '🎌 Quiz Anime Topics',
        value: 'Naruto, Dragon Ball, Pokémon, Demon Slayer, Jujutsu Kaisen,\nTokyo Ghoul, Re:Zero, Slime, Tokyo Revengers, Mushoku Tensei,\nDoraemon, Shinchan & more!',
      },
      {
        name: '🏆 Quiz Ratings',
        value: [
          '10/10 → 🌟 LEGENDARY • 8-9 → ⭐⭐⭐⭐ EXPERT',
          '6-7 → ⭐⭐⭐ GOOD • 4-5 → ⭐⭐ AVERAGE',
          '2-3 → ⭐ BEGINNER • 0-1 → 💀 FAILED',
        ].join('\n'),
      },
      {
        name: '🛠️ General',
        value: [
          '`aq ping` — Show bot latency & WebSocket ping',
          '`aq av [@user]` — Show avatar of a user (or yourself)',
          '`aq help` — Show this help menu',
        ].join('\n'),
      },
      {
        name: '🔨 Moderation (requires permissions)',
        value: [
          '`aq ban @user [reason]` — Ban a user *(Ban Members)*',
          '`aq unban <userID> [reason]` — Unban a user *(Ban Members)*',
          '`aq mute @user [duration] [reason]` — Timeout a user *(Moderate Members)*',
          '`aq unmute @user` — Remove timeout *(Moderate Members)*',
          '`aq warn @user [reason]` — Warn a user *(Manage Messages)*',
          '`aq clearwarns @user` — Clear all warnings *(Manage Messages)*',
        ].join('\n'),
      },
      {
        name: '⏱️ Duration Format (mute)',
        value: '`5m` = 5 minutes, `1h` = 1 hour, `1d` = 1 day\nDefault: 10 minutes',
      },
    )
    .setFooter({ text: 'created by kitaryo senpai' });
  await source.reply({ embeds: [embed] });
}

// ─── GAME: IMPOSTER ───────────────────────────────────────────────────────────

const imposterGames = new Map();

function makeJoinEmbed(game, guild) {
  const playerList = [...game.players.values()].join('\n') || 'None';
  const count = game.players.size;
  return new EmbedBuilder()
    .setColor(BLUE)
    .setTitle('🕵️ Find the Imposter')
    .setDescription(
      `**Server:** ${guild.name}\n\n**Players (${count}):**\n${playerList}\n\n` +
      (count < 4 ? `🔸 Need **${4 - count}** more player(s) to start.` : '✅ Ready to start! Host can begin.')
    )
    .setFooter({ text: 'Click Join to enter • Host clicks Start when ready' });
}

function imposterJoinRow(guildId, channelId, canStart) {
  const join = new ButtonBuilder()
    .setCustomId(`imp_join:${guildId}:${channelId}`)
    .setLabel('Join Game')
    .setStyle(ButtonStyle.Success);
  const start = new ButtonBuilder()
    .setCustomId(`imp_start:${guildId}:${channelId}`)
    .setLabel('▶ Start (Host Only)')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(!canStart);
  return new ActionRowBuilder().addComponents(join, start);
}

async function startImposter(channel, host) {
  const key = gameKey(channel.guild.id, channel.id);
  if (imposterGames.has(key)) {
    await channel.send({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('❌ A game is already running in this channel!')] });
    return;
  }
  const game = {
    hostId: host.id,
    guildId: channel.guild.id,
    channelId: channel.id,
    players: new Map([[host.id, host.displayName]]),
    alive: new Set([host.id]),
    imposterId: '',
    state: 'joining',
    votes: new Map(),
    embedMessageId: '',
  };
  imposterGames.set(key, game);
  const msg = await channel.send({
    embeds: [makeJoinEmbed(game, channel.guild)],
    components: [imposterJoinRow(channel.guild.id, channel.id, false)],
  });
  game.embedMessageId = msg.id;
}

async function handleImposterJoin(interaction, guildId, channelId) {
  const key = gameKey(guildId, channelId);
  const game = imposterGames.get(key);
  if (!game || game.state !== 'joining') {
    await interaction.reply({ content: '❌ No active game or game already started.', ephemeral: true }); return;
  }
  if (game.players.has(interaction.user.id)) {
    await interaction.reply({ content: '✅ You already joined!', ephemeral: true }); return;
  }
  const member = interaction.member;
  game.players.set(interaction.user.id, member.displayName);
  game.alive.add(interaction.user.id);
  const canStart = game.players.size >= 4;
  await interaction.update({
    embeds: [makeJoinEmbed(game, interaction.guild)],
    components: [imposterJoinRow(guildId, channelId, canStart)],
  });
}

async function handleImposterStart(interaction, guildId, channelId, client) {
  const key = gameKey(guildId, channelId);
  const game = imposterGames.get(key);
  if (!game || game.state !== 'joining') {
    await interaction.reply({ content: '❌ No active game.', ephemeral: true }); return;
  }
  if (interaction.user.id !== game.hostId) {
    await interaction.reply({ content: '❌ Only the host can start the game.', ephemeral: true }); return;
  }
  if (game.players.size < 4) {
    await interaction.reply({ content: `❌ Need at least 4 players! (${game.players.size}/4)`, ephemeral: true }); return;
  }
  game.state = 'killing';
  const playerIds = [...game.players.keys()];
  game.imposterId = playerIds[Math.floor(Math.random() * playerIds.length)];
  const startEmbed = new EmbedBuilder()
    .setColor(BLUE)
    .setTitle('🕵️ Find the Imposter — Game Started!')
    .setDescription(
      `**Players (${game.players.size}):**\n${[...game.players.values()].join('\n')}\n\n` +
      `📩 Check your DMs for your role!\n🔪 The imposter will make their move soon...`
    );
  await interaction.update({ embeds: [startEmbed], components: [] });
  for (const [pid, pname] of game.players) {
    try {
      const user = await client.users.fetch(pid);
      const isImposter = pid === game.imposterId;
      const roleEmbed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle(isImposter ? '🔪 You are the IMPOSTER!' : '👥 You are a CREWMATE!')
        .setDescription(
          isImposter
            ? `You are the imposter in **${interaction.guild.name}**!\nEliminate crewmates without getting caught.\nWait — a kill button will appear below.`
            : `You are a crewmate in **${interaction.guild.name}**!\nTry to find the imposter during voting.\nGood luck, ${pname}!`
        );
      await user.send({ embeds: [roleEmbed] });
    } catch { /* DMs closed */ }
  }
  await sendKillDm(game, client, interaction.guild.name);
}

async function sendKillDm(game, client, guildName) {
  const crewmates = [...game.alive].filter(id => id !== game.imposterId);
  if (crewmates.length === 0) { await endImposterGame(game, client, 'imposter'); return; }
  try {
    const imposterUser = await client.users.fetch(game.imposterId);
    const guild = await client.guilds.fetch(game.guildId);
    const aliveNames = await Promise.all(
      crewmates.map(async id => {
        const m = await guild.members.fetch(id).catch(() => null);
        return m ? { label: m.displayName.slice(0, 25), value: id } : null;
      })
    );
    const options = aliveNames.filter(Boolean);
    if (options.length === 0) return;
    const select = new StringSelectMenuBuilder()
      .setCustomId(`imp_kill:${game.guildId}:${game.channelId}`)
      .setPlaceholder('Select a crewmate to eliminate...')
      .addOptions(options.map(o => new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value)));
    const killEmbed = new EmbedBuilder()
      .setColor(BLUE)
      .setTitle('🔪 IMPOSTER — Kill Phase')
      .setDescription(`**Server:** ${guildName}\n\nChoose a crewmate to eliminate. Pick wisely!`);
    const row = new ActionRowBuilder().addComponents(select);
    await imposterUser.send({ embeds: [killEmbed], components: [row] });
  } catch {
    const crewmates2 = [...game.alive].filter(id => id !== game.imposterId);
    if (crewmates2.length > 0) {
      const victim = crewmates2[Math.floor(Math.random() * crewmates2.length)];
      await performKill(game, victim, client, guildName + ' (imposter DMs closed — auto-kill)');
    }
  }
}

async function performKill(game, victimId, client, _note) {
  const victimName = game.players.get(victimId) ?? '???';
  game.lastKilledName = victimName;
  game.alive.delete(victimId);
  game.state = 'voting';
  const guild = await client.guilds.fetch(game.guildId);
  const channel = await guild.channels.fetch(game.channelId);
  const alivePlayers = (await Promise.all([...game.alive].map(async id => {
    const m = await guild.members.fetch(id).catch(() => null);
    return m ? `✅ ${m.displayName}` : `✅ Unknown`;
  }))).join('\n');
  const killEmbed = new EmbedBuilder()
    .setColor(BLUE)
    .setTitle('🔪 Imposter Killed Someone!')
    .setDescription(
      `💀 **Imposter killed ${victimName}!**\n\n**Alive Players (${game.alive.size}):**\n${alivePlayers}\n\n🗳️ **VOTE NOW — 3 minutes!**\nClick the button below to cast your vote!\n\n📊 *Votes: 0/${game.alive.size}*`
    )
    .setFooter({ text: 'Voting closes in 3 minutes' });
  const voteBtn = new ButtonBuilder()
    .setCustomId(`imp_vote_open:${game.guildId}:${game.channelId}`)
    .setLabel('🗳️ Cast My Vote')
    .setStyle(ButtonStyle.Primary);
  const row = new ActionRowBuilder().addComponents(voteBtn);
  const voteMsg = await channel.send({ embeds: [killEmbed], components: [row] });
  game.embedMessageId = voteMsg.id;
  game.votes = new Map();
  game.voteTimer = setTimeout(async () => {
    await resolveImposterVotes(game, client);
  }, 3 * 60 * 1000);
}

async function handleImposterKill(interaction, guildId, channelId, client) {
  const key = gameKey(guildId, channelId);
  const game = imposterGames.get(key);
  if (!game || game.state !== 'killing') {
    await interaction.reply({ content: '❌ No active kill phase.', ephemeral: true }); return;
  }
  if (interaction.user.id !== game.imposterId) {
    await interaction.reply({ content: '❌ Only the imposter can kill.', ephemeral: true }); return;
  }
  const victimId = interaction.values[0];
  await interaction.update({ components: [], embeds: [new EmbedBuilder().setColor(BLUE).setDescription('🔪 Kill initiated...')] });
  const guild = await client.guilds.fetch(guildId);
  await performKill(game, victimId, client, guild.name);
}

async function handleImposterVoteOpen(interaction, guildId, channelId, client) {
  const key = gameKey(guildId, channelId);
  const game = imposterGames.get(key);
  if (!game || game.state !== 'voting') {
    await interaction.reply({ content: '❌ Voting is not active.', ephemeral: true }); return;
  }
  if (!game.alive.has(interaction.user.id)) {
    await interaction.reply({ content: '❌ You have been eliminated and cannot vote.', ephemeral: true }); return;
  }
  if (game.votes.has(interaction.user.id)) {
    await interaction.reply({ content: '✅ You already voted!', ephemeral: true }); return;
  }
  const guild = await client.guilds.fetch(guildId);
  const optionsArr = await Promise.all(
    [...game.alive]
      .filter(id => id !== interaction.user.id)
      .map(async id => {
        const m = await guild.members.fetch(id).catch(() => null);
        return m ? { label: m.displayName.slice(0, 25), value: id } : null;
      })
  );
  const validOptions = optionsArr.filter(Boolean);
  if (validOptions.length === 0) {
    await interaction.reply({ content: '❌ No players to vote for.', ephemeral: true }); return;
  }
  const select = new StringSelectMenuBuilder()
    .setCustomId(`imp_vote_select:${guildId}:${channelId}`)
    .setPlaceholder('Vote for the imposter...')
    .addOptions(validOptions.map(o => new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value)));
  const voteEmbed = new EmbedBuilder()
    .setColor(BLUE)
    .setTitle('🗳️ Cast Your Vote')
    .setDescription('Who do you think is the imposter? Choose wisely!');
  await interaction.reply({ embeds: [voteEmbed], components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
}

async function handleImposterVoteSelect(interaction, guildId, channelId, client) {
  const key = gameKey(guildId, channelId);
  const game = imposterGames.get(key);
  if (!game || game.state !== 'voting') {
    await interaction.reply({ content: '❌ Voting is not active.', ephemeral: true }); return;
  }
  const votedId = interaction.values[0];
  game.votes.set(interaction.user.id, votedId);
  await interaction.update({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription(`✅ **Vote cast!** Waiting for others...\n📊 *Votes so far: ${game.votes.size}/${game.alive.size}*`)], components: [] });
  // Update the main channel embed with live vote count
  try {
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);
    const victimName = game.lastKilledName ?? 'a crewmate';
    const alivePlayers = [...game.alive].map(id => `✅ ${game.players.get(id) ?? id}`).join('\n');
    const updatedEmbed = new EmbedBuilder()
      .setColor(BLUE)
      .setTitle('🔪 Imposter Killed Someone!')
      .setDescription(
        `💀 **Imposter killed ${victimName}!**\n\n**Alive Players (${game.alive.size}):**\n${alivePlayers}\n\n🗳️ **VOTE NOW — 3 minutes!**\nClick the button below to cast your vote!\n\n📊 *Votes: ${game.votes.size}/${game.alive.size}*`
      )
      .setFooter({ text: 'Voting closes in 3 minutes' });
    const voteBtn = new ButtonBuilder()
      .setCustomId(`imp_vote_open:${guildId}:${channelId}`)
      .setLabel('🗳️ Cast My Vote')
      .setStyle(ButtonStyle.Primary);
    const msg = await channel.messages.fetch(game.embedMessageId);
    await msg.edit({ embeds: [updatedEmbed], components: [new ActionRowBuilder().addComponents(voteBtn)] });
  } catch { /* ignore if message not found */ }
  if (game.votes.size >= game.alive.size) {
    clearTimeout(game.voteTimer);
    await resolveImposterVotes(game, client);
  }
}

async function resolveImposterVotes(game, client) {
  const key = gameKey(game.guildId, game.channelId);
  if (!imposterGames.has(key)) return;
  const tally = new Map();
  for (const [, voted] of game.votes) {
    tally.set(voted, (tally.get(voted) ?? 0) + 1);
  }
  // Build vote breakdown string (sorted by most votes)
  const voteBreakdown = [...game.alive]
    .map(id => {
      const name = game.players.get(id) ?? id;
      const count = tally.get(id) ?? 0;
      return `${count > 0 ? '🗳️' : '⬜'} **${name}** — ${count} vote${count !== 1 ? 's' : ''}`;
    })
    .sort((a, b) => {
      const ca = parseInt(a.match(/— (\d+)/)[1]);
      const cb = parseInt(b.match(/— (\d+)/)[1]);
      return cb - ca;
    })
    .join('\n');
  const totalVotes = game.votes.size;
  let maxVotes = 0;
  let ejectedId = null;
  // Check for ties
  const counts = [...tally.values()];
  const topCount = counts.length ? Math.max(...counts) : 0;
  const topPlayers = [...tally.entries()].filter(([, c]) => c === topCount);
  if (topPlayers.length === 1) { ejectedId = topPlayers[0][0]; maxVotes = topCount; }
  const guild = await client.guilds.fetch(game.guildId);
  const channel = await guild.channels.fetch(game.channelId);
  if (!ejectedId) {
    const tieEmbed = new EmbedBuilder().setColor(BLUE).setTitle('🗳️ Vote Result — Tied!')
      .setDescription(`❓ **Tie! No one was ejected.**\nThe imposter is safe this round...\n\n📊 **Vote Breakdown (${totalVotes} votes):**\n${voteBreakdown || '*No votes cast*'}`);
    await channel.send({ embeds: [tieEmbed] });
    game.state = 'killing';
    await sendKillDm(game, client, guild.name);
    return;
  }
  const ejectedName = game.players.get(ejectedId) ?? '???';
  const wasImposter = ejectedId === game.imposterId;
  if (wasImposter) {
    imposterGames.delete(key);
    const winEmbed = new EmbedBuilder()
      .setColor(BLUE)
      .setTitle('🕵️ Imposter Found!')
      .setDescription(
        `🎉 **${ejectedName}** was the imposter!\n\nCrewmates win! 🏆\n\n📊 **Vote Breakdown (${totalVotes} votes):**\n${voteBreakdown}`
      );
    await channel.send({ embeds: [winEmbed] });
  } else {
    game.alive.delete(ejectedId);
    const crewmates = [...game.alive].filter(id => id !== game.imposterId);
    if (crewmates.length === 0) {
      await endImposterGame(game, client, 'imposter'); return;
    }
    const wrongEmbed = new EmbedBuilder()
      .setColor(BLUE)
      .setTitle('❌ Wrong Ejection!')
      .setDescription(
        `💀 **${ejectedName}** has been eliminated with **${maxVotes} vote${maxVotes !== 1 ? 's' : ''}**!\nBut they were NOT the imposter! The imposter is still among you...\n\n📊 **Vote Breakdown (${totalVotes} votes):**\n${voteBreakdown}\n\nGame continues...`
      );
    await channel.send({ embeds: [wrongEmbed] });
    game.state = 'killing';
    await sendKillDm(game, client, guild.name);
  }
}

async function endImposterGame(game, client, winner) {
  const key = gameKey(game.guildId, game.channelId);
  imposterGames.delete(key);
  const guild = await client.guilds.fetch(game.guildId);
  const channel = await guild.channels.fetch(game.channelId);
  const imposterName = game.players.get(game.imposterId) ?? '???';
  const endEmbed = new EmbedBuilder()
    .setColor(BLUE)
    .setTitle(winner === 'imposter' ? '🔪 Imposter Wins!' : '🏆 Crewmates Win!')
    .setDescription(
      winner === 'imposter'
        ? `The imposter **${imposterName}** eliminated all crewmates! 😈`
        : `Crewmates successfully found the imposter **${imposterName}**! 🎉`
    );
  await channel.send({ embeds: [endEmbed] });
}

// ─── GAME: RPS ────────────────────────────────────────────────────────────────

const rpsGames = new Map();
const RPS_EMOJI = { rock: '🪨', paper: '📄', scissors: '✂️' };

function rpsBeats(a, b) {
  return (a === 'rock' && b === 'scissors') || (a === 'paper' && b === 'rock') || (a === 'scissors' && b === 'paper');
}

function rpsChoiceRow(guildId, channelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rps_pick:${guildId}:${channelId}:rock`).setLabel('🪨 Rock').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`rps_pick:${guildId}:${channelId}:paper`).setLabel('📄 Paper').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`rps_pick:${guildId}:${channelId}:scissors`).setLabel('✂️ Scissors').setStyle(ButtonStyle.Primary),
  );
}

function rpsWaitingEmbed(game) {
  return new EmbedBuilder()
    .setColor(BLUE)
    .setTitle('✂️ Rock Paper Scissors')
    .setDescription(`**Player 1:** ${game.player1Name}\n**Player 2:** Waiting...\n\nClick **Join** to challenge ${game.player1Name}!`)
    .setFooter({ text: '2 players needed • First to join plays' });
}

function rpsPlayEmbed(game) {
  const p1status = game.choice1 ? '✅ Chosen!' : '⏳ Choosing...';
  const p2status = game.choice2 ? '✅ Chosen!' : '⏳ Choosing...';
  return new EmbedBuilder()
    .setColor(BLUE)
    .setTitle('✂️ Rock Paper Scissors')
    .setDescription(
      `**${game.player1Name}** vs **${game.player2Name}**\n\n` +
      `${game.player1Name}: ${p1status}\n${game.player2Name}: ${p2status}\n\n` +
      `⏱️ **20 seconds** to choose!\nClick your choice below!`
    )
    .setFooter({ text: 'Choose wisely!' });
}

async function startRPS(channel, host) {
  const key = gameKey(channel.guild.id, channel.id);
  if (rpsGames.has(key)) {
    await channel.send({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('❌ A game is already running here!')] }); return;
  }
  const game = {
    player1Id: host.id, player1Name: host.displayName,
    player2Id: null, player2Name: null,
    choice1: null, choice2: null,
    channelId: channel.id, guildId: channel.guild.id, embedMessageId: '',
  };
  rpsGames.set(key, game);
  const joinBtn = new ButtonBuilder()
    .setCustomId(`rps_join:${channel.guild.id}:${channel.id}`)
    .setLabel('⚔️ Join Game').setStyle(ButtonStyle.Success);
  const msg = await channel.send({ embeds: [rpsWaitingEmbed(game)], components: [new ActionRowBuilder().addComponents(joinBtn)] });
  game.embedMessageId = msg.id;
}

async function handleRPSJoin(interaction, guildId, channelId) {
  const key = gameKey(guildId, channelId);
  const game = rpsGames.get(key);
  if (!game || game.player2Id !== null) {
    await interaction.reply({ content: '❌ Game is full or not active.', ephemeral: true }); return;
  }
  if (interaction.user.id === game.player1Id) {
    await interaction.reply({ content: '❌ You cannot play against yourself!', ephemeral: true }); return;
  }
  game.player2Id = interaction.user.id;
  game.player2Name = interaction.member.displayName;
  game.timer = setTimeout(async () => {
    await resolveRPS(game, interaction.channel);
  }, 20_000);
  await interaction.update({ embeds: [rpsPlayEmbed(game)], components: [rpsChoiceRow(guildId, channelId)] });
}

async function handleRPSPick(interaction, guildId, channelId, choice) {
  const key = gameKey(guildId, channelId);
  const game = rpsGames.get(key);
  if (!game || !game.player2Id) {
    await interaction.reply({ content: '❌ No active game.', ephemeral: true }); return;
  }
  if (interaction.user.id !== game.player1Id && interaction.user.id !== game.player2Id) {
    await interaction.reply({ content: '❌ You are not a player in this game.', ephemeral: true }); return;
  }
  const isP1 = interaction.user.id === game.player1Id;
  if (isP1 && game.choice1) { await interaction.reply({ content: '✅ You already chose!', ephemeral: true }); return; }
  if (!isP1 && game.choice2) { await interaction.reply({ content: '✅ You already chose!', ephemeral: true }); return; }
  if (isP1) game.choice1 = choice; else game.choice2 = choice;
  await interaction.reply({ content: `✅ You chose **${RPS_EMOJI[choice]} ${choice}**! Waiting for opponent...`, ephemeral: true });
  if (game.choice1 && game.choice2) {
    clearTimeout(game.timer);
    await interaction.message.edit({ embeds: [rpsPlayEmbed(game)], components: [rpsChoiceRow(guildId, channelId)] });
    await resolveRPS(game, interaction.channel);
  } else {
    await interaction.message.edit({ embeds: [rpsPlayEmbed(game)], components: [rpsChoiceRow(guildId, channelId)] });
  }
}

async function resolveRPS(game, channel) {
  const key = gameKey(game.guildId, game.channelId);
  if (!rpsGames.has(key)) return;
  rpsGames.delete(key);
  const choices = ['rock', 'paper', 'scissors'];
  const c1 = game.choice1 ?? choices[Math.floor(Math.random() * 3)];
  const c2 = game.choice2 ?? choices[Math.floor(Math.random() * 3)];
  const timeout1 = !game.choice1;
  const timeout2 = !game.choice2;
  let resultLine;
  if (c1 === c2) resultLine = `🤝 **It's a Tie!**`;
  else if (rpsBeats(c1, c2)) resultLine = `🏆 **${game.player1Name} wins!**`;
  else resultLine = `🏆 **${game.player2Name} wins!**`;
  const embed = new EmbedBuilder()
    .setColor(BLUE)
    .setTitle('✂️ Rock Paper Scissors — Result!')
    .setDescription(
      `**${game.player1Name}:** ${RPS_EMOJI[c1]} ${c1}${timeout1 ? ' *(random — timed out)*' : ''}\n` +
      `**${game.player2Name}:** ${RPS_EMOJI[c2]} ${c2}${timeout2 ? ' *(random — timed out)*' : ''}\n\n` + resultLine
    )
    .setFooter({ text: 'Use aq play rps to start a new game' });
  try {
    const msg = await channel.messages.fetch(game.embedMessageId);
    await msg.edit({ embeds: [embed], components: [] });
  } catch { await channel.send({ embeds: [embed] }); }
}

// ─── GAME: RUMBLE ─────────────────────────────────────────────────────────────

const rumbleGames = new Map();

function rumbleJoinEmbed(game, timeLeft) {
  const playerList = [...game.players.values()].map(n => `• ${n}`).join('\n') || 'None';
  return new EmbedBuilder()
    .setColor(BLUE)
    .setTitle('💥 Rumble — Battle Royale!')
    .setDescription(
      `**Players (${game.players.size}):**\n${playerList}\n\n` +
      (timeLeft !== undefined ? `⏱️ Game starts in **${timeLeft}s** or when host clicks Start!\n` : '') +
      `Click **Join** to enter the Rumble!`
    )
    .setFooter({ text: '2 minute join window • Last one standing wins!' });
}

function rumbleControlRow(guildId, channelId, canStart) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rum_join:${guildId}:${channelId}`).setLabel('⚔️ Join Rumble').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`rum_start:${guildId}:${channelId}`).setLabel('▶ Start (Host Only)').setStyle(ButtonStyle.Primary).setDisabled(!canStart),
  );
}

async function startRumble(channel, host) {
  const key = gameKey(channel.guild.id, channel.id);
  if (rumbleGames.has(key)) {
    await channel.send({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('❌ A Rumble is already running here!')] }); return;
  }
  const game = {
    hostId: host.id, guildId: channel.guild.id, channelId: channel.id,
    players: new Map([[host.id, host.displayName]]),
    state: 'joining', embedMessageId: '',
  };
  rumbleGames.set(key, game);
  const msg = await channel.send({
    embeds: [rumbleJoinEmbed(game, 120)],
    components: [rumbleControlRow(channel.guild.id, channel.id, true)],
  });
  game.embedMessageId = msg.id;
  let secondsLeft = 120;
  const tick = setInterval(async () => {
    secondsLeft -= 30;
    if (secondsLeft > 0 && game.state === 'joining') {
      try { await msg.edit({ embeds: [rumbleJoinEmbed(game, secondsLeft)], components: [rumbleControlRow(channel.guild.id, channel.id, true)] }); } catch { }
    }
  }, 30_000);
  game.joinTimer = setTimeout(async () => {
    clearInterval(tick);
    if (game.state === 'joining') await beginRumble(game, channel, null);
  }, 120_000);
  game._tick = tick;
}

async function handleRumbleJoin(interaction, guildId, channelId) {
  const key = gameKey(guildId, channelId);
  const game = rumbleGames.get(key);
  if (!game || game.state !== 'joining') {
    await interaction.reply({ content: '❌ No active Rumble or it already started.', ephemeral: true }); return;
  }
  if (game.players.has(interaction.user.id)) {
    await interaction.reply({ content: '✅ You are already in!', ephemeral: true }); return;
  }
  game.players.set(interaction.user.id, interaction.member.displayName);
  await interaction.update({ embeds: [rumbleJoinEmbed(game)], components: [rumbleControlRow(guildId, channelId, true)] });
}

async function handleRumbleStart(interaction, guildId, channelId, client) {
  const key = gameKey(guildId, channelId);
  const game = rumbleGames.get(key);
  if (!game || game.state !== 'joining') {
    await interaction.reply({ content: '❌ No active Rumble.', ephemeral: true }); return;
  }
  if (interaction.user.id !== game.hostId) {
    await interaction.reply({ content: '❌ Only the host can start the Rumble.', ephemeral: true }); return;
  }
  if (game.players.size < 2) {
    await interaction.reply({ content: '❌ Need at least **2 players** to start!', ephemeral: true }); return;
  }
  clearTimeout(game.joinTimer);
  clearInterval(game._tick);
  await interaction.update({ components: [] });
  await beginRumble(game, interaction.channel, client);
}

async function beginRumble(game, channel, _client) {
  const key = gameKey(game.guildId, game.channelId);
  if (!rumbleGames.has(key) || game.state !== 'joining') return;
  if (game.players.size < 2) {
    rumbleGames.delete(key);
    await channel.send({ embeds: [new EmbedBuilder().setColor(BLUE).setTitle('💥 Rumble Cancelled').setDescription('❌ Not enough players joined!')] }); return;
  }
  game.state = 'playing';
  const alive = new Map(game.players);
  const startEmbed = new EmbedBuilder()
    .setColor(BLUE).setTitle('💥 RUMBLE BEGINS!')
    .setDescription(`**${alive.size} warriors** enter the arena!\n\n` + [...alive.values()].map(n => `⚔️ ${n}`).join('\n') + `\n\n🏆 Only ONE can survive!`);
  await channel.send({ embeds: [startEmbed] });
  await new Promise(r => setTimeout(r, 3000));
  let round = 1;
  while (alive.size > 1) {
    if (!rumbleGames.has(key)) return;
    const ids = [...alive.keys()];
    const elimId = ids[Math.floor(Math.random() * ids.length)];
    const elimName = alive.get(elimId);
    alive.delete(elimId);
    const roundEmbed = new EmbedBuilder()
      .setColor(BLUE).setTitle(`💥 Round ${round} — Elimination!`)
      .setDescription(`☠️ **${elimName}** has been eliminated!\n\n**Remaining Warriors (${alive.size}):**\n` + [...alive.values()].map(n => `⚔️ ${n}`).join('\n'))
      .setFooter({ text: alive.size > 1 ? 'Next elimination in 5 seconds...' : 'Last one standing!' });
    await channel.send({ embeds: [roundEmbed] });
    round++;
    if (alive.size > 1) await new Promise(r => setTimeout(r, 5000));
  }
  rumbleGames.delete(key);
  const [[, winnerName]] = [...alive.entries()];
  const winEmbed = new EmbedBuilder()
    .setColor(BLUE).setTitle('🏆 RUMBLE WINNER!')
    .setDescription(`🎉 **${winnerName}** is the last one standing!\n\nCongratulations, champion!`)
    .setFooter({ text: 'Use aq play rumble to start a new game' });
  await channel.send({ embeds: [winEmbed] });
}

// ─── GAME: ROULETTE ───────────────────────────────────────────────────────────

const rouletteGames = new Map();

function spinCylinder() { return Math.ceil(Math.random() * 6); }

function rouletteAlive(game) { return game.turnOrder.filter(id => !game.eliminated.includes(id)); }

function rouletteNextAlive(game, afterId) {
  const live = rouletteAlive(game);
  const idx = live.indexOf(afterId);
  return live[(idx + 1) % live.length];
}

function rouletteJoinEmbed(game) {
  const list = [...game.players.values()].map(n => `🔫 ${n}`).join('\n') || 'No players';
  return new EmbedBuilder()
    .setColor(BLUE).setTitle('🔫 Russian Roulette')
    .setDescription(`**Players (${game.players.size}/6):**\n${list}\n\nClick **Join** to risk your life!\nHost clicks **Start** when ready (min 2 players).`)
    .setFooter({ text: '⚠️ Each click could be your last' });
}

function roulettePlayingEmbed(game, lastEvent) {
  const live = rouletteAlive(game);
  const aliveList = live.map(id => {
    const n = game.players.get(id) ?? id;
    return id === game.currentTurnId ? `🎯 **${n}** ← YOUR TURN` : `💚 ${n}`;
  }).join('\n');
  const elimList = game.eliminated.length
    ? game.eliminated.map(id => `💀 ~~${game.players.get(id) ?? id}~~`).join('\n')
    : '*None yet*';
  return new EmbedBuilder()
    .setColor(BLUE).setTitle('🔫 Russian Roulette — IN PROGRESS').setDescription(lastEvent)
    .addFields({ name: '💚 Alive', value: aliveList, inline: true }, { name: '💀 Eliminated', value: elimList, inline: true })
    .setFooter({ text: `${live.length} survivors remaining • 1 bullet, 6 chambers` });
}

function rouletteJoinRow(guildId, channelId, canStart) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rou_join:${guildId}:${channelId}`).setLabel('🔫 Join').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`rou_start:${guildId}:${channelId}`).setLabel('▶ Start (Host Only)').setStyle(ButtonStyle.Primary).setDisabled(!canStart),
  );
}

function rouletteTriggerRow(guildId, channelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rou_trigger:${guildId}:${channelId}`).setLabel('🔫 Pull Trigger').setStyle(ButtonStyle.Danger),
  );
}

async function beginRoulette(game, channel) {
  clearTimeout(game.joinTimer);
  game.state = 'playing';
  game.turnOrder = [...game.players.keys()].sort(() => Math.random() - 0.5);
  game.currentTurnId = game.turnOrder[0];
  game.bulletPos = spinCylinder();
  game.pullCount = 0;
  const firstName = game.players.get(game.currentTurnId) ?? '???';
  const embed = roulettePlayingEmbed(game, `🌀 Cylinder spun! **${firstName}** goes first — click below if you dare!`);
  try {
    const msg = await channel.messages.fetch(game.embedMessageId);
    await msg.edit({ embeds: [embed], components: [rouletteTriggerRow(game.guildId, game.channelId)] });
  } catch {
    const msg = await channel.send({ embeds: [embed], components: [rouletteTriggerRow(game.guildId, game.channelId)] });
    game.embedMessageId = msg.id;
  }
}

async function startRoulette(channel, host) {
  const key = gameKey(channel.guild.id, channel.id);
  if (rouletteGames.has(key)) {
    await channel.send({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('❌ A Roulette game is already running here!')] }); return;
  }
  const game = {
    hostId: host.id, guildId: channel.guild.id, channelId: channel.id,
    players: new Map([[host.id, host.displayName]]),
    state: 'joining', embedMessageId: '',
    turnOrder: [], currentTurnId: '', bulletPos: 0, pullCount: 0, eliminated: [],
  };
  rouletteGames.set(key, game);
  const msg = await channel.send({ embeds: [rouletteJoinEmbed(game)], components: [rouletteJoinRow(channel.guild.id, channel.id, false)] });
  game.embedMessageId = msg.id;
  game.joinTimer = setTimeout(async () => {
    if (game.state !== 'joining') return;
    if (game.players.size < 2) {
      rouletteGames.delete(key);
      await msg.edit({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('❌ Not enough players. Roulette cancelled.')], components: [] });
    } else { await beginRoulette(game, channel); }
  }, 60_000);
}

async function handleRouletteJoin(interaction, guildId, channelId) {
  const key = gameKey(guildId, channelId);
  const game = rouletteGames.get(key);
  if (!game || game.state !== 'joining') { await interaction.reply({ content: '❌ No roulette lobby to join right now.', ephemeral: true }); return; }
  if (game.players.size >= 6) { await interaction.reply({ content: '❌ Lobby is full (6/6)!', ephemeral: true }); return; }
  if (game.players.has(interaction.member.id)) { await interaction.reply({ content: '✅ You\'re already in!', ephemeral: true }); return; }
  game.players.set(interaction.member.id, interaction.member.displayName);
  const canStart = game.players.size >= 2;
  await interaction.update({ embeds: [rouletteJoinEmbed(game)], components: [rouletteJoinRow(guildId, channelId, canStart)] });
}

async function handleRouletteStart(interaction, guildId, channelId) {
  const key = gameKey(guildId, channelId);
  const game = rouletteGames.get(key);
  if (!game || game.state !== 'joining') { await interaction.reply({ content: '❌ No roulette lobby here.', ephemeral: true }); return; }
  if (interaction.member.id !== game.hostId) { await interaction.reply({ content: '❌ Only the host can start!', ephemeral: true }); return; }
  if (game.players.size < 2) { await interaction.reply({ content: '❌ Need at least 2 players to start!', ephemeral: true }); return; }
  await interaction.deferUpdate();
  await beginRoulette(game, interaction.channel);
}

async function handleRouletteTrigger(interaction, guildId, channelId) {
  const key = gameKey(guildId, channelId);
  const game = rouletteGames.get(key);
  if (!game || game.state !== 'playing') { await interaction.reply({ content: '❌ No active roulette game here.', ephemeral: true }); return; }
  if (interaction.member.id !== game.currentTurnId) { await interaction.reply({ content: `❌ It's not your turn! Wait for your go.`, ephemeral: true }); return; }
  await interaction.deferUpdate();
  const channel = interaction.channel;
  const currentName = game.players.get(game.currentTurnId) ?? '???';
  game.pullCount++;
  if (game.pullCount === game.bulletPos) {
    game.eliminated.push(game.currentTurnId);
    const survivors = rouletteAlive(game);
    if (survivors.length === 1) {
      game.state = 'ended';
      rouletteGames.delete(key);
      const winnerName = game.players.get(survivors[0]) ?? '???';
      const endEmbed = new EmbedBuilder().setColor(BLUE).setTitle('🔫 Russian Roulette — GAME OVER!')
        .setDescription(`💥 **${currentName}** pulled the trigger... **BANG!** 💀\n\n🏆 **${winnerName}** is the last survivor and wins!\n\n*Eliminated: ${game.eliminated.map(id => game.players.get(id)).join(', ')}*`);
      try { const msg = await channel.messages.fetch(game.embedMessageId); await msg.edit({ embeds: [endEmbed], components: [] }); }
      catch { await channel.send({ embeds: [endEmbed] }); }
      return;
    }
    game.pullCount = 0; game.bulletPos = spinCylinder();
    game.currentTurnId = survivors[0];
    const nextName = game.players.get(game.currentTurnId) ?? '???';
    const event = `💥 **${currentName}** pulled the trigger... **BANG!** 💀 Eliminated!\n🌀 Cylinder reloaded for ${survivors.length} survivors — **${nextName}** is next!`;
    const embed = roulettePlayingEmbed(game, event);
    try { const msg = await channel.messages.fetch(game.embedMessageId); await msg.edit({ embeds: [embed], components: [rouletteTriggerRow(guildId, channelId)] }); }
    catch { const msg = await channel.send({ embeds: [embed], components: [rouletteTriggerRow(guildId, channelId)] }); game.embedMessageId = msg.id; }
  } else {
    const nextId = rouletteNextAlive(game, game.currentTurnId);
    game.currentTurnId = nextId;
    const nextName = game.players.get(nextId) ?? '???';
    const event = `😮‍💨 **${currentName}** pulled the trigger... *click.* Safe!\n**${nextName}**'s turn now!`;
    const embed = roulettePlayingEmbed(game, event);
    try { const msg = await channel.messages.fetch(game.embedMessageId); await msg.edit({ embeds: [embed], components: [rouletteTriggerRow(guildId, channelId)] }); }
    catch { const msg = await channel.send({ embeds: [embed], components: [rouletteTriggerRow(guildId, channelId)] }); game.embedMessageId = msg.id; }
  }
}

// ─── GAME: QUIZ ───────────────────────────────────────────────────────────────

const quizGames = new Map();

const QUIZ_TIMERS = { easy: 20_000, normal: 15_000, hard: 12_000, extreme: 8_000 };
const DIFF_EMOJI = { easy: '🟢', normal: '🟡', hard: '🔴', extreme: '💀' };

const ALL_QUESTIONS = [
  { anime: 'Naruto', difficulty: 'easy', question: 'What is the name of the Nine-Tailed Fox in Naruto?', options: ['Kurama', 'Shukaku', 'Gyuki', 'Chomei'], answer: 0 },
  { anime: 'Naruto', difficulty: 'easy', question: 'What village is Naruto Uzumaki from?', options: ['Konohagakure (Leaf)', 'Sunagakure (Sand)', 'Kirigakure (Mist)', 'Kumogakure (Cloud)'], answer: 0 },
  { anime: 'Dragon Ball', difficulty: 'easy', question: 'What color does a Super Saiyan\'s hair turn?', options: ['Golden Yellow', 'Blue', 'Red', 'Silver'], answer: 0 },
  { anime: 'Dragon Ball', difficulty: 'easy', question: 'What is Goku\'s Saiyan birth name?', options: ['Kakarot', 'Vegeta', 'Broly', 'Nappa'], answer: 0 },
  { anime: 'Pokémon', difficulty: 'easy', question: 'What type is Pikachu?', options: ['Electric', 'Fire', 'Water', 'Normal'], answer: 0 },
  { anime: 'Pokémon', difficulty: 'easy', question: 'Who is the original Pokémon trainer of Pikachu?', options: ['Ash Ketchum', 'Brock', 'Misty', 'Gary Oak'], answer: 0 },
  { anime: 'Demon Slayer', difficulty: 'easy', question: 'What is the name of Tanjiro\'s younger sister?', options: ['Nezuko', 'Kanao', 'Aoi', 'Shinobu'], answer: 0 },
  { anime: 'Demon Slayer', difficulty: 'easy', question: 'What organization do Tanjiro and his friends join?', options: ['Demon Slayer Corps', 'Jujutsu High', 'Survey Corps', 'Gotei 13'], answer: 0 },
  { anime: 'Doraemon', difficulty: 'easy', question: 'Where does Doraemon keep all his gadgets?', options: ['His belly pocket', 'His hat', 'His ears', 'His tail'], answer: 0 },
  { anime: 'Doraemon', difficulty: 'easy', question: 'What is the name of the main human boy in Doraemon?', options: ['Nobita', 'Suneo', 'Gian', 'Dekisugi'], answer: 0 },
  { anime: 'Shinchan', difficulty: 'easy', question: 'What is Shinnosuke\'s family surname?', options: ['Nohara', 'Harima', 'Kurosaki', 'Uzumaki'], answer: 0 },
  { anime: 'Shinchan', difficulty: 'easy', question: 'What is the name of Shinchan\'s pet dog?', options: ['Shiro', 'Koro', 'Pochi', 'Hachi'], answer: 0 },
  { anime: 'Jujutsu Kaisen', difficulty: 'easy', question: 'What is the main character\'s name in Jujutsu Kaisen?', options: ['Yuji Itadori', 'Megumi Fushiguro', 'Satoru Gojo', 'Ryomen Sukuna'], answer: 0 },
  { anime: 'Jujutsu Kaisen', difficulty: 'easy', question: 'What is the special power system called in Jujutsu Kaisen?', options: ['Cursed Energy', 'Chakra', 'Nen', 'Haki'], answer: 0 },
  { anime: 'Tokyo Ghoul', difficulty: 'easy', question: 'What is the name of the weapon ghouls use from their body?', options: ['Kagune', 'Zanpakuto', 'Requiem', 'Quinque'], answer: 0 },
  { anime: 'Re:Zero', difficulty: 'easy', question: 'What happens to Subaru Natsuki when he dies?', options: ['Returns to a Save Point', 'Loses memories', 'Becomes a spirit', 'Disappears forever'], answer: 0 },
  { anime: 'That Time I Got Reincarnated as a Slime', difficulty: 'easy', question: 'What form does the main character Rimuru start with?', options: ['A Slime', 'A Dragon', 'A Goblin', 'A Wolf'], answer: 0 },
  { anime: 'Tokyo Revengers', difficulty: 'easy', question: 'What is the name of the main gang in Tokyo Revengers?', options: ['Tokyo Manji Gang (Toman)', 'Black Dragons', 'Valhalla', 'Brahman'], answer: 0 },
  { anime: 'Mushoku Tensei', difficulty: 'easy', question: 'What is the genre of Mushoku Tensei?', options: ['Isekai (reincarnation)', 'Mecha', 'Sports', 'Horror'], answer: 0 },
  { anime: 'Naruto', difficulty: 'normal', question: 'Who is Naruto\'s father?', options: ['Minato Namikaze', 'Jiraiya', 'Kakashi Hatake', 'Hiruzen Sarutobi'], answer: 0 },
  { anime: 'Naruto', difficulty: 'normal', question: 'What is the name of Sasuke\'s brother?', options: ['Itachi Uchiha', 'Madara Uchiha', 'Obito Uchiha', 'Shisui Uchiha'], answer: 0 },
  { anime: 'Naruto Shippuden', difficulty: 'normal', question: 'Who is the leader of the Akatsuki organization?', options: ['Pain (Nagato)', 'Obito Uchiha', 'Madara Uchiha', 'Konan'], answer: 0 },
  { anime: 'Dragon Ball', difficulty: 'normal', question: 'How many Dragon Balls must be collected to summon Shenron?', options: ['7', '5', '10', '3'], answer: 0 },
  { anime: 'Dragon Ball', difficulty: 'normal', question: 'What is the name of Goku\'s signature attack?', options: ['Kamehameha', 'Galick Gun', 'Final Flash', 'Special Beam Cannon'], answer: 0 },
  { anime: 'Pokémon', difficulty: 'normal', question: 'What is the final evolution of Bulbasaur?', options: ['Venusaur', 'Ivysaur', 'Roserade', 'Tropius'], answer: 0 },
  { anime: 'Pokémon', difficulty: 'normal', question: 'What legendary Pokémon is on the cover of Pokémon Red?', options: ['Charizard', 'Mewtwo', 'Articuno', 'Moltres'], answer: 0 },
  { anime: 'Demon Slayer', difficulty: 'normal', question: 'What breathing style does Tanjiro primarily use?', options: ['Water Breathing', 'Flame Breathing', 'Wind Breathing', 'Thunder Breathing'], answer: 0 },
  { anime: 'Demon Slayer', difficulty: 'normal', question: 'Who is the Flame Hashira in Demon Slayer?', options: ['Rengoku Kyojuro', 'Tengen Uzui', 'Shinobu Kocho', 'Sanemi Shinazugawa'], answer: 0 },
  { anime: 'Jujutsu Kaisen', difficulty: 'normal', question: 'Who is the strongest Jujutsu Sorcerer (Special Grade)?', options: ['Satoru Gojo', 'Kento Nanami', 'Yuji Itadori', 'Suguru Geto'], answer: 0 },
  { anime: 'Jujutsu Kaisen', difficulty: 'normal', question: 'What is the name of Megumi Fushiguro\'s most powerful technique?', options: ['Ten Shadows Technique', 'Limitless', 'Black Flash', 'Divergent Fist'], answer: 0 },
  { anime: 'Tokyo Ghoul', difficulty: 'normal', question: 'What organization hunts Ghouls in Tokyo Ghoul?', options: ['CCG (Commission of Counter Ghoul)', 'V Organization', 'Aogiri Tree', 'Clowns'], answer: 0 },
  { anime: 'Re:Zero', difficulty: 'normal', question: 'Who is the main heroine of Re:Zero?', options: ['Emilia', 'Rem', 'Ram', 'Beatrice'], answer: 0 },
  { anime: 'Tokyo Revengers', difficulty: 'normal', question: 'What special ability does Takemichi Hanagaki have?', options: ['Time Leaping', 'Future Vision', 'Super Speed', 'Telepathy'], answer: 0 },
  { anime: 'That Time I Got Reincarnated as a Slime', difficulty: 'normal', question: 'What is the name of Rimuru\'s nation that he founds?', options: ['Jura Tempest Federation', 'Ingrassia Kingdom', 'Dwargon', 'Demon Lord Milim\'s Domain'], answer: 0 },
  { anime: 'Mushoku Tensei', difficulty: 'normal', question: 'What is Rudeus Greyrat\'s main magic affinity?', options: ['Water, Fire & Earth', 'Wind & Lightning', 'Dark & Void', 'Holy & Light'], answer: 0 },
  { anime: 'Doraemon', difficulty: 'normal', question: 'From what era in the future does Doraemon come?', options: ['22nd Century', '30th Century', '25th Century', '50th Century'], answer: 0 },
  { anime: 'Naruto Shippuden', difficulty: 'hard', question: 'What is the name of Minato Namikaze\'s space-time jutsu?', options: ['Flying Thunder God (Hiraishin)', 'Kamui', 'Izanagi', 'Kotoamatsukami'], answer: 0 },
  { anime: 'Naruto Shippuden', difficulty: 'hard', question: 'Who was the original user of the Rinnegan?', options: ['Hagoromo Otsutsuki (Sage of Six Paths)', 'Madara Uchiha', 'Nagato', 'Obito Uchiha'], answer: 0 },
  { anime: 'Naruto Shippuden', difficulty: 'hard', question: 'What is the true name of Tobi revealed in Shippuden?', options: ['Obito Uchiha', 'Madara Uchiha', 'Izuna Uchiha', 'Kagami Uchiha'], answer: 0 },
  { anime: 'Dragon Ball', difficulty: 'hard', question: 'What is the name of Goku\'s Ultra Instinct master form?', options: ['Mastered Ultra Instinct', 'Super Saiyan God Ultra', 'Ultra Ego', 'Divine Ki Form'], answer: 0 },
  { anime: 'Dragon Ball', difficulty: 'hard', question: 'Which villain was the first to achieve a power level of over 1,000,000?', options: ['Frieza (Final Form)', 'Cell (Perfect)', 'Majin Buu', 'Broly'], answer: 0 },
  { anime: 'Demon Slayer', difficulty: 'hard', question: 'Who was the original creator of Sun Breathing (Hinokami Kagura)?', options: ['Yoriichi Tsugikuni', 'Tanjiro\'s Father', 'Kokushibo', 'Muzan Kibutsuji'], answer: 0 },
  { anime: 'Demon Slayer', difficulty: 'hard', question: 'What are the twelve kizuki (Twelve Demon Moons) called when serving Muzan?', options: ['Upper and Lower Moons', 'Blood Demons', 'Elite Demons', 'Demon Kings'], answer: 0 },
  { anime: 'Jujutsu Kaisen', difficulty: 'hard', question: 'What is the name of Gojo\'s signature domain expansion?', options: ['Infinite Void', 'Malevolent Shrine', 'Self-Embodiment of Perfection', 'Chimera Shadow Garden'], answer: 0 },
  { anime: 'Jujutsu Kaisen', difficulty: 'hard', question: 'How many fingers of Ryomen Sukuna does Yuji consume in episode 1?', options: ['1', '2', '5', '10'], answer: 0 },
  { anime: 'Tokyo Ghoul', difficulty: 'hard', question: 'What is Kaneki\'s designation as a half-ghoul investigator called?', options: ['One-Eyed Ghoul', 'Quinx', 'Hybrid', 'Kakuja'], answer: 0 },
  { anime: 'Re:Zero', difficulty: 'hard', question: 'What is the name of Subaru\'s divine protection?', options: ['Divine Protection of Miasma Manipulation', 'Return by Death', 'Unseen Hands', 'Gate of Power'], answer: 0 },
  { anime: 'Re:Zero', difficulty: 'hard', question: 'Who is the Witch of Envy in Re:Zero?', options: ['Satella', 'Echidna', 'Minerva', 'Carmilla'], answer: 0 },
  { anime: 'Tokyo Revengers', difficulty: 'hard', question: 'Who is Mikey\'s (Manjiro Sano\'s) older brother that was killed?', options: ['Shinichiro Sano', 'Baji Keisuke', 'Kazutora Hanemiya', 'Takuya Yamamoto'], answer: 0 },
  { anime: 'That Time I Got Reincarnated as a Slime', difficulty: 'hard', question: 'What unique skill does Rimuru gain from the Great Sage?', options: ['Predator (Gluttony)', 'Storm Dragon', 'Space-Time Magic', 'Covenant King'], answer: 0 },
  { anime: 'Mushoku Tensei', difficulty: 'hard', question: 'What is the name of Rudeus\'s sword master teacher?', options: ['Ghislaine Dedoldia', 'Roxy Migurdia', 'Eris Boreas Greyrat', 'Paul Greyrat'], answer: 0 },
  { anime: 'Pokémon', difficulty: 'hard', question: 'Which Pokémon is known as the "Pokémon God" or creator of the universe?', options: ['Arceus', 'Dialga', 'Palkia', 'Giratina'], answer: 0 },
  { anime: 'Naruto Shippuden', difficulty: 'extreme', question: 'What is the name of the specific Sharingan technique Itachi used to trap Sasuke in an illusion forever?', options: ['Tsukuyomi', 'Amaterasu', 'Kotoamatsukami', 'Izanami'], answer: 0 },
  { anime: 'Naruto Shippuden', difficulty: 'extreme', question: 'Which clan does Kaguya Otsutsuki belong to, and what is her unique ability?', options: ['Otsutsuki — All-Killing Ash Bones & Byakugan', 'Uchiha — Rinne Sharingan', 'Senju — Wood Release', 'Uzumaki — Adamantine Chains'], answer: 0 },
  { anime: 'Dragon Ball', difficulty: 'extreme', question: 'What is the name of the special beam cannon technique that killed Goku and Raditz?', options: ['Makankosappo (Special Beam Cannon)', 'Hakai', 'Mafuba', 'Destructo Disc'], answer: 0 },
  { anime: 'Dragon Ball', difficulty: 'extreme', question: 'In Dragon Ball Super, who is the Destroyer God of Universe 7?', options: ['Beerus', 'Champa', 'Belmod', 'Quitela'], answer: 0 },
  { anime: 'Jujutsu Kaisen', difficulty: 'extreme', question: 'What is the exact name of Sukuna\'s domain expansion?', options: ['Malevolent Shrine (Fukuma Mizushi)', 'Infinite Void', 'Horizon of the Captivating Skandha', 'Coffin of the Iron Mountain'], answer: 0 },
  { anime: 'Jujutsu Kaisen', difficulty: 'extreme', question: 'What technique does Yuta Okkotsu use that is different from regular cursed energy?', options: ['Rika — Special Grade Vengeful Cursed Spirit', 'Ten Shadows', 'Idle Transfiguration', 'Black Flash'], answer: 0 },
  { anime: 'Demon Slayer', difficulty: 'extreme', question: 'How many forms does Sun Breathing (Hinokami Kagura) have?', options: ['13', '10', '7', '12'], answer: 0 },
  { anime: 'Demon Slayer', difficulty: 'extreme', question: 'What is the real name of the Upper Moon 1 demon (Kokushibo)?', options: ['Michikatsu Tsugikuni', 'Douma', 'Akaza', 'Gyokko'], answer: 0 },
  { anime: 'Re:Zero', difficulty: 'extreme', question: 'What is the name of the method Echidna (Witch of Greed) uses to meet Subaru?', options: ['Tea Party in the Corridor of Dreams', 'Soul Marriage', 'Trial of the Sanctuary', 'Star Reading'], answer: 0 },
  { anime: 'Tokyo Ghoul', difficulty: 'extreme', question: 'What is the name of the Ghoul restaurant where Kaneki was taken as "food"?', options: ['Helter Skelter', 'Anteiku', 'Lunatic Eclipse', 'Ghoul Dining'], answer: 0 },
  { anime: 'That Time I Got Reincarnated as a Slime', difficulty: 'extreme', question: 'What is the name of the ultimate skill Rimuru gains after becoming a True Demon Lord?', options: ['Wisdom King Raphael', 'Storm Dragon Veldora', 'Gluttony King Beelzebub', 'Void God Azathoth'], answer: 0 },
  { anime: 'Mushoku Tensei', difficulty: 'extreme', question: 'What is the name of the world\'s strongest human-god technique that Rudeus eventually learns?', options: ['Mana Calamity (Touki)', 'Detachment of Fighting God', 'Absolute Zero', 'Silent Void Magic'], answer: 0 },
  { anime: 'Tokyo Revengers', difficulty: 'extreme', question: 'What is the name of the final villain organization that Mikey leads in the future timeline?', options: ['Kantou Manji Gang', 'Brahman', 'Rokuhara Tandai', 'Black Dragons'], answer: 0 },
  { anime: 'Pokémon', difficulty: 'extreme', question: 'What is the National Pokédex number of Lucario?', options: ['448', '392', '445', '430'], answer: 0 },
];

function getQuizRating(score) {
  if (score === 10) return '🌟 **LEGENDARY** — Anime God! Absolutely perfect!';
  if (score >= 8)  return '⭐⭐⭐⭐ **EXPERT** — True Otaku! Impressive!';
  if (score >= 6)  return '⭐⭐⭐ **GOOD** — Decent Weeb! Keep watching!';
  if (score >= 4)  return '⭐⭐ **AVERAGE** — You need to watch more anime!';
  if (score >= 2)  return '⭐ **BEGINNER** — Bhai aur anime dekh!';
  return '💀 **FAILED** — Are you even an anime fan?! 😂';
}

function pickQuestions(difficulty) {
  const pool = ALL_QUESTIONS.filter(q => q.difficulty === difficulty);
  return [...pool].sort(() => Math.random() - 0.5).slice(0, 10);
}

function answerButtons(userId, qIdx, options) {
  const letters = ['A', 'B', 'C', 'D'];
  const row1 = new ActionRowBuilder().addComponents(
    [0, 1].map(i => new ButtonBuilder().setCustomId(`quiz_ans:${userId}:${qIdx}:${i}`).setLabel(`${letters[i]}. ${options[i]}`.slice(0, 80)).setStyle(ButtonStyle.Primary))
  );
  const row2 = new ActionRowBuilder().addComponents(
    [2, 3].map(i => new ButtonBuilder().setCustomId(`quiz_ans:${userId}:${qIdx}:${i}`).setLabel(`${letters[i]}. ${options[i]}`.slice(0, 80)).setStyle(ButtonStyle.Secondary))
  );
  return [row1, row2];
}

function quizQuestionEmbed(game) {
  const q = game.questions[game.currentIdx];
  const timerSec = QUIZ_TIMERS[game.difficulty] / 1000;
  const progress = '▓'.repeat(game.currentIdx) + '░'.repeat(10 - game.currentIdx);
  return new EmbedBuilder()
    .setColor(BLUE)
    .setTitle(`🎌 Anime Quiz — ${DIFF_EMOJI[game.difficulty]} ${game.difficulty.toUpperCase()}`)
    .setDescription(
      `**Question ${game.currentIdx + 1} / 10** • Score: **${game.score}**\n\`${progress}\`\n\n` +
      `⏱️ You have **${timerSec}s** to answer!\n\n🎯 Anime: *${q.anime}*\n\n❓ **${q.question}**\n\n👇 *Click a button below to choose your answer!*`
    )
    .setFooter({ text: `Player: ${game.userName} • ${game.difficulty.toUpperCase()} difficulty` });
}

async function showQuestion(game, channel) {
  const embed = quizQuestionEmbed(game);
  const q = game.questions[game.currentIdx];
  const rows = answerButtons(game.userId, game.currentIdx, q.options);
  try {
    const msg = await channel.messages.fetch(game.messageId);
    await msg.edit({ embeds: [embed], components: rows });
  } catch {
    const newMsg = await channel.send({ embeds: [embed], components: rows });
    game.messageId = newMsg.id;
  }
  game.timer = setTimeout(async () => { await handleQuizTimeout(game, channel); }, QUIZ_TIMERS[game.difficulty]);
}

async function handleQuizTimeout(game, channel) {
  if (!quizGames.has(game.userId)) return;
  const q = game.questions[game.currentIdx];
  const timeoutEmbed = new EmbedBuilder()
    .setColor(BLUE).setTitle('⏰ Time\'s Up!')
    .setDescription(`❌ **Too slow!**\n\nCorrect answer was: **${['A','B','C','D'][q.answer]}. ${q.options[q.answer]}**\n\nScore so far: **${game.score}/10**`);
  try { const msg = await channel.messages.fetch(game.messageId); await msg.edit({ embeds: [timeoutEmbed], components: [] }); } catch { }
  await new Promise(r => setTimeout(r, 2000));
  await advanceQuiz(game, channel);
}

async function advanceQuiz(game, channel) {
  game.currentIdx++;
  if (game.currentIdx >= 10) { await endQuiz(game, channel); }
  else { await showQuestion(game, channel); }
}

async function endQuiz(game, channel) {
  quizGames.delete(game.userId);
  clearTimeout(game.timer);
  const endEmbed = new EmbedBuilder()
    .setColor(BLUE).setTitle('🎌 Quiz Complete!')
    .setDescription(`**${game.userName}**, your quiz has ended!\n\n📊 **Final Score:** ${game.score}/10\n\n${getQuizRating(game.score)}\n\nDifficulty: ${DIFF_EMOJI[game.difficulty]} ${game.difficulty.toUpperCase()}`)
    .setFooter({ text: 'Use aq play quiz [easy/normal/hard/extreme] to play again!' });
  try { const msg = await channel.messages.fetch(game.messageId); await msg.edit({ embeds: [endEmbed], components: [] }); }
  catch { await channel.send({ embeds: [endEmbed] }); }
}

async function startQuiz(channel, member, difficulty) {
  if (quizGames.has(member.id)) {
    await channel.send({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('❌ You already have an active quiz! Answer or wait for it to finish.')] }); return;
  }
  const questions = pickQuestions(difficulty);
  if (questions.length < 10) {
    await channel.send({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription(`❌ Not enough questions for **${difficulty}** difficulty yet!`)] }); return;
  }
  const startEmbed = new EmbedBuilder()
    .setColor(BLUE).setTitle(`🎌 Anime Quiz — ${DIFF_EMOJI[difficulty]} ${difficulty.toUpperCase()}`)
    .setDescription(
      `**${member.displayName}**, your quiz is starting!\n\n📋 **10 questions** from popular anime\n` +
      `⏱️ **${QUIZ_TIMERS[difficulty] / 1000}s** per question\n🎯 Anime: Naruto, Dragon Ball, Pokémon, Demon Slayer, JJK, Tokyo Ghoul, Re:Zero, Slime & more!\n\nGet ready...`
    );
  const msg = await channel.send({ embeds: [startEmbed] });
  const game = { userId: member.id, userName: member.displayName, channelId: channel.id, difficulty, questions, currentIdx: 0, score: 0, messageId: msg.id };
  quizGames.set(member.id, game);
  await new Promise(r => setTimeout(r, 2000));
  await showQuestion(game, channel);
}

async function handleQuizAnswer(interaction, userId, questionIdx, answerIdx, client) {
  if (interaction.user.id !== userId) { await interaction.reply({ content: '❌ This is not your quiz!', ephemeral: true }); return; }
  const game = quizGames.get(userId);
  if (!game) { await interaction.reply({ content: '❌ No active quiz found.', ephemeral: true }); return; }
  if (game.currentIdx !== questionIdx) { await interaction.reply({ content: '❌ This question has already passed.', ephemeral: true }); return; }
  clearTimeout(game.timer);
  await interaction.deferUpdate().catch(() => {});
  const q = game.questions[game.currentIdx];
  const correct = answerIdx === q.answer;
  if (correct) game.score++;
  const feedbackEmbed = new EmbedBuilder()
    .setColor(BLUE).setTitle(correct ? '✅ Correct!' : '❌ Wrong!')
    .setDescription(
      (correct ? `🎉 **That's right!**` : `💔 **Wrong answer!**\nCorrect: **${['A','B','C','D'][q.answer]}. ${q.options[q.answer]}**`) +
      `\n\nScore: **${game.score}/${game.currentIdx + 1}**`
    );
  try {
    const guild = await client.guilds.fetch(interaction.guildId);
    const channel = await guild.channels.fetch(game.channelId);
    const msg = await channel.messages.fetch(game.messageId);
    await msg.edit({ embeds: [feedbackEmbed], components: [] });
    await new Promise(r => setTimeout(r, 1500));
    await advanceQuiz(game, channel);
  } catch (err) { console.error('[Quiz]', err); }
}

// ─── GAME: HANGMAN ────────────────────────────────────────────────────────────

const hangmanGames = new Map();
const HANGMAN_TIMEOUT = 3 * 60 * 1000;
const MAX_WRONG = 7;

const GALLOWS = [
  '```\n  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n=========```',
  '```\n  +---+\n  |   |\n [X]  |\n /|\\  |\n / \\  |\n      |\n=========```',
];

const ANIME_WORDS = [
  { name: 'NARUTO', hint: 'Future Hokage of Konoha — Naruto' },
  { name: 'SASUKE', hint: 'Last Uchiha, rival of Naruto — Naruto' },
  { name: 'SAKURA', hint: 'Pink-haired medical ninja — Naruto' },
  { name: 'KAKASHI', hint: 'Copy Ninja of Team 7 — Naruto' },
  { name: 'ITACHI', hint: 'Uchiha prodigy who loved his brother — Naruto' },
  { name: 'HINATA', hint: 'Byakugan princess of the Hyuga clan — Naruto' },
  { name: 'GAARA', hint: 'Sand Kazekage, once feared demon — Naruto' },
  { name: 'JIRAIYA', hint: 'Toad Sage and Naruto\'s teacher — Naruto' },
  { name: 'OROCHIMARU', hint: 'Snake Sannin who seeks immortality — Naruto' },
  { name: 'MINATO', hint: 'Yellow Flash, 4th Hokage — Naruto' },
  { name: 'GOKU', hint: 'Earth\'s greatest Saiyan warrior — Dragon Ball' },
  { name: 'VEGETA', hint: 'Prince of the Saiyan race — Dragon Ball' },
  { name: 'GOHAN', hint: 'Goku\'s half-Saiyan son — Dragon Ball' },
  { name: 'PICCOLO', hint: 'Namekian warrior and Gohan\'s mentor — Dragon Ball' },
  { name: 'FRIEZA', hint: 'Cold emperor of the universe — Dragon Ball' },
  { name: 'BROLY', hint: 'Legendary Super Saiyan — Dragon Ball' },
  { name: 'BEERUS', hint: 'God of Destruction of Universe 7 — Dragon Ball' },
  { name: 'TRUNKS', hint: 'Son of Vegeta from the future — Dragon Ball' },
  { name: 'TANJIRO', hint: 'Demon Slayer with Sun Breathing — Demon Slayer' },
  { name: 'NEZUKO', hint: 'Tanjiro\'s demon little sister — Demon Slayer' },
  { name: 'ZENITSU', hint: 'Thunder Breathing, scared but powerful — Demon Slayer' },
  { name: 'INOSUKE', hint: 'Boar-masked Beast Breathing user — Demon Slayer' },
  { name: 'RENGOKU', hint: 'Flame Hashira, set my soul ablaze! — Demon Slayer' },
  { name: 'MUZAN', hint: 'Original demon king — Demon Slayer' },
  { name: 'SHINOBU', hint: 'Insect Hashira with poison blades — Demon Slayer' },
  { name: 'GYOMEI', hint: 'Stone Hashira, strongest of the Nine — Demon Slayer' },
  { name: 'PIKACHU', hint: 'Electric mouse companion of Ash — Pokemon' },
  { name: 'MEWTWO', hint: 'Genetically engineered psychic Pokemon — Pokemon' },
  { name: 'CHARIZARD', hint: 'Fire and Flying dragon-like Pokemon — Pokemon' },
  { name: 'LUCARIO', hint: 'Aura-sensing steel/fighting Pokemon — Pokemon' },
  { name: 'LUFFY', hint: 'Rubber Pirate King with a straw hat — One Piece' },
  { name: 'ZORO', hint: 'Three-sword swordsman, wants to be the greatest — One Piece' },
  { name: 'NAMI', hint: 'Navigator with the clima-tact — One Piece' },
  { name: 'SHANKS', hint: 'Red-haired Yonko who inspired Luffy — One Piece' },
  { name: 'SAITAMA', hint: 'Bald hero who wins with one punch — One Punch Man' },
  { name: 'GENOS', hint: 'S-Class cyborg hero disciple — One Punch Man' },
  { name: 'KANEKI', hint: 'Half-ghoul who became the One-Eyed King — Tokyo Ghoul' },
  { name: 'TOUKA', hint: 'Bunny-masked ghoul of Anteiku cafe — Tokyo Ghoul' },
  { name: 'SUBARU', hint: 'Isekai hero with Return by Death — Re:Zero' },
  { name: 'EMILIA', hint: 'Silver-haired half-elf royal candidate — Re:Zero' },
  { name: 'RIMURU', hint: 'Reincarnated great sage slime — Slime' },
  { name: 'MILIM', hint: 'Dragonoid demon lord, oldest friend of Rimuru — Slime' },
  { name: 'YUJI', hint: 'Sukuna\'s vessel, Divergent Fist user — JJK' },
  { name: 'GOJO', hint: 'Infinity user, strongest jujutsu sorcerer — JJK' },
  { name: 'MEGUMI', hint: 'Ten Shadows Technique user — JJK' },
  { name: 'NOBARA', hint: 'Straw Doll Technique user — JJK' },
  { name: 'SUKUNA', hint: 'King of Curses with four arms — JJK' },
  { name: 'LEVI', hint: 'Humanity\'s strongest soldier — Attack on Titan' },
  { name: 'EREN', hint: 'Founding Titan who chose the Rumbling — Attack on Titan' },
  { name: 'MIKASA', hint: 'Ackerman warrior who loves Eren — Attack on Titan' },
  { name: 'ARMIN', hint: 'Brilliant strategist who inherited the Colossal — Attack on Titan' },
  { name: 'REINER', hint: 'Armored Titan warrior with split identity — Attack on Titan' },
  { name: 'LELOUCH', hint: 'Zero, the masked prince with Geass — Code Geass' },
  { name: 'DORAEMON', hint: 'Blue robotic cat from the future — Doraemon' },
  { name: 'NOBITA', hint: 'Doraemon\'s lazy human best friend — Doraemon' },
  { name: 'SHINCHAN', hint: 'Mischievous 5-year-old of Kasukabe — Shinchan' },
  { name: 'MIKEY', hint: 'Invincible Mikey, Toman\'s leader — Tokyo Revengers' },
  { name: 'DRAKEN', hint: 'Dragon tattoo, vice-captain of Toman — Tokyo Revengers' },
  { name: 'RUDEUS', hint: 'Reincarnated boy, world\'s greatest mage — Mushoku Tensei' },
  { name: 'ROXY', hint: 'Blue-haired water magic teacher — Mushoku Tensei' },
];

function hangmanPickWord() {
  return ANIME_WORDS[Math.floor(Math.random() * ANIME_WORDS.length)];
}

function hangmanDisplayWord(word, guessed) {
  return word.split('').map(c => (c === ' ' ? '  ' : guessed.has(c) ? `**${c}**` : '\\_')).join(' ');
}

function hangmanBuildEmbed(game, status) {
  const wrongCount = game.wrong.size;
  const wrongLetters = [...game.wrong].join(', ') || 'None';
  const wordDisplay = hangmanDisplayWord(game.word, game.guessed);
  const livesLeft = MAX_WRONG - wrongCount;
  return new EmbedBuilder()
    .setColor(BLUE).setTitle('🎮 Anime Hangman')
    .setDescription(
      GALLOWS[wrongCount] + '\n' +
      `**Word:** ${wordDisplay}\n\n` +
      `❤️ Lives: **${livesLeft}/${MAX_WRONG}**  |  ❌ Wrong: **${wrongLetters}**\n\n` +
      `💡 Hint: *${game.hint}*\n\n` +
      (status ? `${status}\n\n` : '') +
      `📝 \`aq guess s\` — guess a letter\n📝 \`aq guess sasuke\` — guess the full word`,
    )
    .setFooter({ text: `Player: ${game.userName}` });
}

async function startHangman(channel, member) {
  if (hangmanGames.has(member.id)) {
    await channel.send({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('❌ You already have a Hangman game running! Finish it or wait for timeout.')] }); return;
  }
  const { name, hint } = hangmanPickWord();
  const game = {
    userId: member.id, userName: member.displayName, channelId: channel.id,
    word: name, hint, guessed: new Set(), wrong: new Set(), embedMessageId: '',
  };
  hangmanGames.set(member.id, game);
  const msg = await channel.send({ embeds: [hangmanBuildEmbed(game)] });
  game.embedMessageId = msg.id;
  game.timer = setTimeout(async () => {
    if (!hangmanGames.has(member.id)) return;
    hangmanGames.delete(member.id);
    const timeoutEmbed = new EmbedBuilder().setColor(BLUE).setTitle('⏰ Hangman — Time\'s Up!')
      .setDescription(`⌛ ${member.displayName}, you ran out of time!\nThe word was: **${name}**`);
    try { const m = await channel.messages.fetch(msg.id); await m.edit({ embeds: [timeoutEmbed] }); } catch { }
  }, HANGMAN_TIMEOUT);
}

async function handleHangmanGuess(channel, userId, input) {
  const game = hangmanGames.get(userId);
  if (!game || game.channelId !== channel.id) return;
  if (input.length > 1) {
    const guess = input.toUpperCase().trim();
    const target = game.word.toUpperCase().trim();
    if (guess === target) {
      clearTimeout(game.timer);
      hangmanGames.delete(userId);
      const winEmbed = new EmbedBuilder().setColor(BLUE).setTitle('🎉 Hangman — Correct Word!')
        .setDescription(`🌟 **${game.userName}** guessed the full word!\n\nThe word was: **${game.word}**\n❌ Wrong guesses: **${game.wrong.size}** — ${[...game.wrong].join(', ') || 'None'}`);
      try { const msg = await channel.messages.fetch(game.embedMessageId); await msg.edit({ embeds: [winEmbed] }); }
      catch { await channel.send({ embeds: [winEmbed] }); }
    } else {
      for (let i = 0; i < 3 && game.wrong.size < MAX_WRONG; i++) game.wrong.add(`W${game.wrong.size + 1}`);
      if (game.wrong.size >= MAX_WRONG) {
        clearTimeout(game.timer);
        hangmanGames.delete(userId);
        const loseEmbed = new EmbedBuilder().setColor(BLUE).setTitle('💀 Hangman — Wrong Word!')
          .setDescription(GALLOWS[MAX_WRONG] + '\n' + `💀 **${game.userName}** guessed wrong and was hanged!\n\nThe word was: **${game.word}**`);
        try { const msg = await channel.messages.fetch(game.embedMessageId); await msg.edit({ embeds: [loseEmbed] }); }
        catch { await channel.send({ embeds: [loseEmbed] }); }
        return;
      }
      const livesLeft = MAX_WRONG - game.wrong.size;
      try { const msg = await channel.messages.fetch(game.embedMessageId); await msg.edit({ embeds: [hangmanBuildEmbed(game, `❌ **${input.toUpperCase()}** is wrong! -3 lives. ${livesLeft} lives left.`)] }); } catch { }
    }
    return;
  }
  const L = input.toUpperCase();
  if (game.guessed.has(L) || game.wrong.has(L)) {
    try { const msg = await channel.messages.fetch(game.embedMessageId); await msg.edit({ embeds: [hangmanBuildEmbed(game, `⚠️ You already guessed **${L}**!`)] }); } catch { }
    return;
  }
  if (game.word.includes(L)) {
    game.guessed.add(L);
    const wordLetters = new Set(game.word.replace(/ /g, '').split(''));
    const allFound = [...wordLetters].every(c => game.guessed.has(c));
    if (allFound) {
      clearTimeout(game.timer);
      hangmanGames.delete(userId);
      const winEmbed = new EmbedBuilder().setColor(BLUE).setTitle('🎉 Hangman — You Won!')
        .setDescription(`🌟 **${game.userName}** guessed the word!\n\nThe word was: **${game.word}**\n❌ Wrong guesses: **${game.wrong.size}** — ${[...game.wrong].join(', ') || 'None'}`);
      try { const msg = await channel.messages.fetch(game.embedMessageId); await msg.edit({ embeds: [winEmbed] }); }
      catch { await channel.send({ embeds: [winEmbed] }); }
      return;
    }
    try { const msg = await channel.messages.fetch(game.embedMessageId); await msg.edit({ embeds: [hangmanBuildEmbed(game, `✅ **${L}** is in the word!`)] }); } catch { }
  } else {
    game.wrong.add(L);
    if (game.wrong.size >= MAX_WRONG) {
      clearTimeout(game.timer);
      hangmanGames.delete(userId);
      const loseEmbed = new EmbedBuilder().setColor(BLUE).setTitle('💀 Hangman — You\'re Hanged!')
        .setDescription(GALLOWS[MAX_WRONG] + '\n' + `💀 **${game.userName}** was hanged!\n\nThe word was: **${game.word}**`);
      try { const msg = await channel.messages.fetch(game.embedMessageId); await msg.edit({ embeds: [loseEmbed] }); }
      catch { await channel.send({ embeds: [loseEmbed] }); }
      return;
    }
    const livesLeft = MAX_WRONG - game.wrong.size;
    try { const msg = await channel.messages.fetch(game.embedMessageId); await msg.edit({ embeds: [hangmanBuildEmbed(game, `❌ **${L}** is NOT in the word! ${livesLeft} lives left.`)] }); } catch { }
  }
}

// ─── GAME: BOMB ───────────────────────────────────────────────────────────────

const bombGames = new Map();

function bombAlive(game) { return game.turnOrder.filter(id => !game.eliminated.includes(id)); }

function bombJoinEmbed(game) {
  const list = [...game.players.values()].map(n => `💣 ${n}`).join('\n') || 'No players';
  return new EmbedBuilder().setColor(BLUE).setTitle('💣 Number Bomb')
    .setDescription(
      `**Players (${game.players.size}/6):**\n${list}\n\n` +
      `**How to play:** Take turns adding **1, 2, or 3** to the count.\n` +
      `Whoever reaches the 💣 **secret bomb number** gets ELIMINATED!\n\nClick **Join** or host clicks **Start**!`
    )
    .setFooter({ text: 'Last survivor wins! Bomb number is a secret 💣' });
}

function bombPlayingEmbed(game, lastEvent) {
  const live = bombAlive(game);
  const currentId = live[game.currentTurnIdx % live.length];
  const playerList = live.map(id => {
    const n = game.players.get(id) ?? id;
    return id === currentId ? `🎯 **${n}** ← YOUR TURN` : `✅ ${n}`;
  }).join('\n');
  const elimList = game.eliminated.length
    ? game.eliminated.map(id => `💀 ~~${game.players.get(id) ?? id}~~`).join('\n')
    : '*None yet*';
  return new EmbedBuilder().setColor(BLUE).setTitle('💣 Number Bomb — IN PROGRESS')
    .setDescription(`${lastEvent}\n\n🔢 **Current Count: ${game.count}**\n💡 *Add 1, 2, or 3 — don't hit the bomb!*`)
    .addFields({ name: '✅ Alive', value: playerList, inline: true }, { name: '💀 Eliminated', value: elimList, inline: true })
    .setFooter({ text: `${live.length} players alive • Bomb is hidden somewhere above ${game.count}` });
}

function bombJoinRow(guildId, channelId, canStart) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bomb_join:${guildId}:${channelId}`).setLabel('💣 Join').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bomb_start:${guildId}:${channelId}`).setLabel('▶ Start (Host Only)').setStyle(ButtonStyle.Primary).setDisabled(!canStart),
  );
}

function bombPickRow(guildId, channelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bomb_pick:${guildId}:${channelId}:1`).setLabel('+1').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bomb_pick:${guildId}:${channelId}:2`).setLabel('+2').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bomb_pick:${guildId}:${channelId}:3`).setLabel('+3').setStyle(ButtonStyle.Primary),
  );
}

function newBombNumber(currentCount) {
  const min = currentCount + 4;
  const max = currentCount + 20;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function beginBomb(game, channel) {
  clearTimeout(game.joinTimer);
  game.state = 'playing';
  game.turnOrder = [...game.players.keys()].sort(() => Math.random() - 0.5);
  game.currentTurnIdx = 0; game.count = 0;
  game.bombNumber = newBombNumber(0);
  const live = bombAlive(game);
  const firstName = game.players.get(live[0]) ?? '???';
  const embed = bombPlayingEmbed(game, `💣 Bomb is armed! **${firstName}** goes first. Pick wisely!`);
  try { const msg = await channel.messages.fetch(game.embedMessageId); await msg.edit({ embeds: [embed], components: [bombPickRow(game.guildId, game.channelId)] }); }
  catch { const msg = await channel.send({ embeds: [embed], components: [bombPickRow(game.guildId, game.channelId)] }); game.embedMessageId = msg.id; }
}

async function startBomb(channel, host) {
  const key = gameKey(channel.guild.id, channel.id);
  if (bombGames.has(key)) {
    await channel.send({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('❌ A Number Bomb game is already running here!')] }); return;
  }
  const game = {
    hostId: host.id, guildId: channel.guild.id, channelId: channel.id,
    players: new Map([[host.id, host.displayName]]),
    state: 'joining', embedMessageId: '',
    turnOrder: [], currentTurnIdx: 0, bombNumber: 0, count: 0, eliminated: [],
  };
  bombGames.set(key, game);
  const msg = await channel.send({ embeds: [bombJoinEmbed(game)], components: [bombJoinRow(channel.guild.id, channel.id, false)] });
  game.embedMessageId = msg.id;
  game.joinTimer = setTimeout(async () => {
    if (game.state !== 'joining') return;
    if (game.players.size < 2) {
      bombGames.delete(key);
      await msg.edit({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('❌ Not enough players joined. Number Bomb cancelled.')], components: [] });
    } else { await beginBomb(game, channel); }
  }, 60_000);
}

async function handleBombJoin(interaction, guildId, channelId) {
  const key = gameKey(guildId, channelId);
  const game = bombGames.get(key);
  if (!game || game.state !== 'joining') { await interaction.reply({ content: '❌ No Number Bomb lobby right now.', ephemeral: true }); return; }
  if (game.players.size >= 6) { await interaction.reply({ content: '❌ Lobby is full (6/6)!', ephemeral: true }); return; }
  if (game.players.has(interaction.member.id)) { await interaction.reply({ content: '✅ You\'re already in!', ephemeral: true }); return; }
  game.players.set(interaction.member.id, interaction.member.displayName);
  const canStart = game.players.size >= 2;
  await interaction.update({ embeds: [bombJoinEmbed(game)], components: [bombJoinRow(guildId, channelId, canStart)] });
}

async function handleBombStart(interaction, guildId, channelId) {
  const key = gameKey(guildId, channelId);
  const game = bombGames.get(key);
  if (!game || game.state !== 'joining') { await interaction.reply({ content: '❌ No Number Bomb lobby here.', ephemeral: true }); return; }
  if (interaction.member.id !== game.hostId) { await interaction.reply({ content: '❌ Only the host can start!', ephemeral: true }); return; }
  if (game.players.size < 2) { await interaction.reply({ content: '❌ Need at least 2 players!', ephemeral: true }); return; }
  await interaction.deferUpdate();
  await beginBomb(game, interaction.channel);
}

async function handleBombPick(interaction, guildId, channelId, amount) {
  const key = gameKey(guildId, channelId);
  const game = bombGames.get(key);
  if (!game || game.state !== 'playing') { await interaction.reply({ content: '❌ No active Number Bomb here.', ephemeral: true }); return; }
  const live = bombAlive(game);
  const currentId = live[game.currentTurnIdx % live.length];
  if (interaction.member.id !== currentId) { await interaction.reply({ content: `❌ It's not your turn!`, ephemeral: true }); return; }
  await interaction.deferUpdate();
  const channel = interaction.channel;
  const currentName = game.players.get(currentId) ?? '???';
  game.count += amount;
  if (game.count >= game.bombNumber) {
    game.eliminated.push(currentId);
    const survivors = bombAlive(game);
    if (survivors.length === 1) {
      game.state = 'ended'; bombGames.delete(key);
      const winnerName = game.players.get(survivors[0]) ?? '???';
      const endEmbed = new EmbedBuilder().setColor(BLUE).setTitle('💣 Number Bomb — GAME OVER!')
        .setDescription(`💥 **${currentName}** said **${game.count}** — the bomb number was **${game.bombNumber}**! 💀 ELIMINATED!\n\n🏆 **${winnerName}** survives and wins!\n\n*Eliminated: ${game.eliminated.map(id => game.players.get(id)).join(', ')}*`);
      try { const msg = await channel.messages.fetch(game.embedMessageId); await msg.edit({ embeds: [endEmbed], components: [] }); }
      catch { await channel.send({ embeds: [endEmbed] }); }
      return;
    }
    const prevBomb = game.bombNumber;
    game.count = 0; game.bombNumber = newBombNumber(0); game.currentTurnIdx = 0;
    const nextName = game.players.get(survivors[0]) ?? '???';
    const event = `💥 **${currentName}** said **${game.count + amount}** — BOOM! Bomb was **${prevBomb}**! 💀 Eliminated!\n🔄 New round! Bomb reset — **${nextName}** starts!`;
    const embed = bombPlayingEmbed(game, event);
    try { const msg = await channel.messages.fetch(game.embedMessageId); await msg.edit({ embeds: [embed], components: [bombPickRow(guildId, channelId)] }); }
    catch { const msg = await channel.send({ embeds: [embed], components: [bombPickRow(guildId, channelId)] }); game.embedMessageId = msg.id; }
  } else {
    game.currentTurnIdx = (game.currentTurnIdx + 1) % live.length;
    const nextId = live[game.currentTurnIdx];
    const nextName = game.players.get(nextId) ?? '???';
    const event = `**${currentName}** added **+${amount}** → Count is now **${game.count}**! **${nextName}**'s turn!`;
    const embed = bombPlayingEmbed(game, event);
    try { const msg = await channel.messages.fetch(game.embedMessageId); await msg.edit({ embeds: [embed], components: [bombPickRow(guildId, channelId)] }); }
    catch { const msg = await channel.send({ embeds: [embed], components: [bombPickRow(guildId, channelId)] }); game.embedMessageId = msg.id; }
  }
}

// ─── MESSAGE HANDLER ──────────────────────────────────────────────────────────

async function handleMessage(message, client) {
  if (message.author.bot) return;
  if (!PREFIX_RE.test(message.content)) return;
  const body = message.content.replace(PREFIX_RE, '').trim();
  const parts = body.split(/\s+/);
  const cmd = parts[0]?.toLowerCase() ?? '';
  const args = parts.slice(1);
  const channel = message.channel;
  const member = message.member;
  try {
    switch (cmd) {
      case 'play': {
        const game = args[0]?.toLowerCase();
        if (game === 'imposter') await startImposter(channel, member);
        else if (game === 'rps' || game === 'rock' || game === 'rockpaperscissors') await startRPS(channel, member);
        else if (game === 'rumble') await startRumble(channel, member);
        else if (game === 'quiz') {
          const rawDiff = args[1]?.toLowerCase();
          const validDiffs = ['easy', 'normal', 'hard', 'extreme'];
          const difficulty = validDiffs.includes(rawDiff) ? rawDiff : 'normal';
          await startQuiz(channel, member, difficulty);
        }
        else if (game === 'roulette') await startRoulette(channel, member);
        else if (game === 'hangman') await startHangman(channel, member);
        else if (game === 'bomb') await startBomb(channel, member);
        else await message.reply('❌ Unknown game. Use: `imposter`, `rps`, `rumble`, `quiz`, `roulette`, `hangman`, or `bomb`');
        break;
      }
      case 'guess':
      case 'g': {
        const input = args.join(' ').toLowerCase().trim();
        if (!input || !/^[a-z ]+$/.test(input)) await message.reply('❌ Usage: `aq guess s` (letter) or `aq guess sasuke` (full word)');
        else await handleHangmanGuess(channel, message.author.id, input.replace(/ /g, ''));
        break;
      }
      case 'ping': await handlePing(message, client); break;
      case 'av':
      case 'avatar': await handleAvatar(message, args); break;
      case 'help': await handleHelp(message); break;
      case 'ban': await handleBan(message, args); break;
      case 'unban': await handleUnban(message, args); break;
      case 'mute': await handleMute(message, args); break;
      case 'unmute': await handleUnmute(message, args); break;
      case 'warn': await handleWarn(message, args); break;
      case 'clearwarns': await handleClearWarns(message, args); break;
      default: break;
    }
  } catch (err) {
    console.error('[MessageHandler]', err);
    try { await message.reply('❌ An error occurred. Please try again.'); } catch { }
  }
}

// ─── INTERACTION HANDLER ──────────────────────────────────────────────────────

async function handleInteraction(interaction, client) {
  try {
    if (interaction.isChatInputCommand()) { await handleSlashCommand(interaction, client); return; }
    if (interaction.isButton()) { await handleButton(interaction, client); return; }
    if (interaction.isStringSelectMenu()) { await handleSelect(interaction, client); return; }
  } catch (err) {
    console.error('[InteractionHandler]', err);
    try {
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred)
        await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
    } catch { }
  }
}

async function handleButton(interaction, client) {
  const id = interaction.customId;
  if (id.startsWith('imp_join:')) { const [, g, c] = id.split(':'); await handleImposterJoin(interaction, g, c); }
  else if (id.startsWith('imp_start:')) { const [, g, c] = id.split(':'); await handleImposterStart(interaction, g, c, client); }
  else if (id.startsWith('imp_vote_open:')) { const [, g, c] = id.split(':'); await handleImposterVoteOpen(interaction, g, c, client); }
  else if (id.startsWith('rps_join:')) { const [, g, c] = id.split(':'); await handleRPSJoin(interaction, g, c); }
  else if (id.startsWith('rps_pick:')) { const p = id.split(':'); await handleRPSPick(interaction, p[1], p[2], p[3]); }
  else if (id.startsWith('rum_join:')) { const [, g, c] = id.split(':'); await handleRumbleJoin(interaction, g, c); }
  else if (id.startsWith('rum_start:')) { const [, g, c] = id.split(':'); await handleRumbleStart(interaction, g, c, client); }
  else if (id.startsWith('quiz_ans:')) { const p = id.split(':'); await handleQuizAnswer(interaction, p[1], parseInt(p[2], 10), parseInt(p[3], 10), client); }
  else if (id.startsWith('rou_join:')) { const [, g, c] = id.split(':'); await handleRouletteJoin(interaction, g, c); }
  else if (id.startsWith('rou_start:')) { const [, g, c] = id.split(':'); await handleRouletteStart(interaction, g, c); }
  else if (id.startsWith('rou_trigger:')) { const [, g, c] = id.split(':'); await handleRouletteTrigger(interaction, g, c); }
  else if (id.startsWith('bomb_join:')) { const [, g, c] = id.split(':'); await handleBombJoin(interaction, g, c); }
  else if (id.startsWith('bomb_start:')) { const [, g, c] = id.split(':'); await handleBombStart(interaction, g, c); }
  else if (id.startsWith('bomb_pick:')) { const p = id.split(':'); await handleBombPick(interaction, p[1], p[2], parseInt(p[3], 10)); }
}

async function handleSelect(interaction, client) {
  const id = interaction.customId;
  if (id.startsWith('imp_kill:')) { const [, g, c] = id.split(':'); await handleImposterKill(interaction, g, c, client); }
  else if (id.startsWith('imp_vote_select:')) { const [, g, c] = id.split(':'); await handleImposterVoteSelect(interaction, g, c, client); }
}

async function handleSlashCommand(interaction, client) {
  const { commandName, guild } = interaction;
  if (!guild) { await interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true }); return; }
  const member = interaction.member;
  const channel = interaction.channel;
  switch (commandName) {
    case 'play': {
      const game = interaction.options.getString('game', true);
      await interaction.deferReply();
      if (game === 'imposter') { await startImposter(channel, member); await interaction.deleteReply().catch(() => {}); }
      else if (game === 'rps') { await startRPS(channel, member); await interaction.deleteReply().catch(() => {}); }
      else if (game === 'rumble') { await startRumble(channel, member); await interaction.deleteReply().catch(() => {}); }
      else if (game === 'quiz') { const d = interaction.options.getString('difficulty') ?? 'normal'; await startQuiz(channel, member, d); await interaction.deleteReply().catch(() => {}); }
      else if (game === 'roulette') { await startRoulette(channel, member); await interaction.deleteReply().catch(() => {}); }
      else if (game === 'hangman') { await startHangman(channel, member); await interaction.deleteReply().catch(() => {}); }
      else if (game === 'bomb') { await startBomb(channel, member); await interaction.deleteReply().catch(() => {}); }
      break;
    }
    case 'ping': await handlePing(interaction, client); break;
    case 'avatar': await handleAvatar(interaction, []); break;
    case 'help': await handleHelp(interaction); break;
    case 'ban': await handleBan(interaction, []); break;
    case 'unban': await handleUnban(interaction, []); break;
    case 'mute': await handleMute(interaction, []); break;
    case 'unmute': await handleUnmute(interaction, []); break;
    case 'warn': await handleWarn(interaction, []); break;
    case 'clearwarns': await handleClearWarns(interaction, []); break;
    default: break;
  }
}

// ─── KEEP-ALIVE HTTP SERVER (required for Render web service) ─────────────────

const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('AquaBot is running!\n');
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Keep-alive HTTP server running on port ${PORT}`);
});

// ─── BOT STARTUP ──────────────────────────────────────────────────────────────

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('[Bot] DISCORD_TOKEN environment variable is not set!');
  console.error('[Bot] Please set DISCORD_TOKEN in your Render environment variables.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
});

client.once('clientReady', async (c) => {
  console.log(`[Bot] Logged in as ${c.user.tag}`);
  c.user.setActivity(STATUS, { type: ActivityType.Playing });
  try {
    const rest = new REST({ version: '10' }).setToken(token);
    await rest.put(Routes.applicationCommands(c.user.id), { body: slashCommands });
    console.log(`[Bot] Registered ${slashCommands.length} slash commands globally.`);
  } catch (err) {
    console.error('[Bot] Failed to register slash commands:', err);
  }
});

client.on('messageCreate', (message) => {
  handleMessage(message, client).catch(err => console.error('[Bot] messageCreate error:', err));
});

client.on('interactionCreate', (interaction) => {
  handleInteraction(interaction, client).catch(err => console.error('[Bot] interactionCreate error:', err));
});

client.login(token).catch(err => {
  console.error('[Bot] Login failed:', err);
  process.exit(1);
});

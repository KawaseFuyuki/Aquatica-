import discord
from discord.ext import commands
from discord import app_commands
import json
import os
import random
import asyncio
from flask import Flask
from threading import Thread

# ===== FLASK KEEP ALIVE FOR RENDER =====
app = Flask('')

@app.route('/')
def home():
    return "Bot is running!"

def run():
    app.run(host='0.0.0.0', port=8080)

def keep_alive():
    t = Thread(target=run)
    t.start()

TOKEN = os.getenv('DISCORD_TOKEN')

intents = discord.Intents.default()
intents.message_content = True
intents.members = True

bot = commands.Bot(command_prefix='aq ', intents=intents, help_command=None)

# ===== PERSISTENCE =====
DATA_FILE = 'games.json'

def load_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, 'r') as f:
            return json.load(f)
    return {"imposter": {}, "rumble": {}, "rps": {}}

def save_data(data):
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2)

game_data = load_data()

# ===== MAIN GAMES PANEL - BLUE =====
class GamesPanel(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Find Imposters", style=discord.ButtonStyle.primary, emoji="🎭", custom_id="imposter_btn")
    async def imposter_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        await create_imposter_lobby(interaction, interaction.user)

    @discord.ui.button(label="Rumble", style=discord.ButtonStyle.primary, emoji="💥", custom_id="rumble_btn")
    async def rumble_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        await create_rumble_lobby(interaction, interaction.user)

async def send_games_panel(ctx):
    embed = discord.Embed(
        title="🎮 Mini Games Hub",
        description="**Click buttons or use commands:**\n\n**Games:**\n`/imposter` or `aq imposter`\n`/rps @user` or `aq rps @user`\n`/rumble` or `aq rumble`\n\n**Moderation - Admin Only:**\n`/av @user` | `aq av @user`\n`/mute @user` | `aq mute @user`\n`/unmute @user` | `aq unmute @user`\n`/ban @user` | `aq ban @user`\n`/unban ID` | `aq unban ID`",
        color=0x3498DB
    )
    embed.set_footer(text="Prefix: aq | Slash commands also work")

    if isinstance(ctx, discord.Interaction):
        await ctx.response.send_message(embed=embed, view=GamesPanel())
    else:
        await ctx.send(embed=embed, view=GamesPanel())

# ===== IMPOSTER GAME =====
class ImposterLobbyView(discord.ui.View):
    def __init__(self, channel_id):
        super().__init__(timeout=None)
        self.channel_id = str(channel_id)

    @discord.ui.button(label="Join", style=discord.ButtonStyle.success, emoji="➕")
    async def join(self, interaction: discord.Interaction, button: discord.ui.Button):
        game = game_data["imposter"].get(self.channel_id)
        if not game or game["started"]:
            return await interaction.response.send_message("Lobby is closed or game already started.", ephemeral=True)
        if interaction.user.id in game["players"]:
            return await interaction.response.send_message("You already joined!", ephemeral=True)

        game["players"].append(interaction.user.id)
        save_data()

        players_mention = [f"<@{pid}>" for pid in game["players"]]
        embed = discord.Embed(
            title="🎭 Find Imposters Lobby",
            description=f"**Minimum 5 Players | Maximum: Unlimited**\nHost: <@{game['host']}>",
            color=0x3498DB
        )
        embed.add_field(name=f"Players [{len(players_mention)}/5]", value="\n".join(players_mention))
        await interaction.response.edit_message(embed=embed)

    @discord.ui.button(label="Leave", style=discord.ButtonStyle.danger, emoji="➖")
    async def leave(self, interaction: discord.Interaction, button: discord.ui.Button):
        game = game_data["imposter"].get(self.channel_id)
        if interaction.user.id not in game["players"]:
            return await interaction.response.send_message("You are not in the lobby!", ephemeral=True)
        if interaction.user.id == game["host"]:
            return await interaction.response.send_message("Host cannot leave! Delete the lobby by not starting.", ephemeral=True)

        game["players"].remove(interaction.user.id)
        save_data()

        players_mention = [f"<@{pid}>" for pid in game["players"]]
        embed = discord.Embed(
            title="🎭 Find Imposters Lobby",
            description=f"**Minimum 5 Players | Maximum: Unlimited**\nHost: <@{game['host']}>",
            color=0x3498DB
        )
        embed.add_field(name=f"Players [{len(players_mention)}/5]", value="\n".join(players_mention) or "None")
        await interaction.response.edit_message(embed=embed)

    @discord.ui.button(label="Start Game", style=discord.ButtonStyle.primary, emoji="▶️")
    async def start(self, interaction: discord.Interaction, button: discord.ui.Button):
        game = game_data["imposter"].get(self.channel_id)

        # HOST ONLY CHECK
        if interaction.user.id!= game["host"]:
            return await interaction.response.send_message("Only the host can start the game!", ephemeral=True)
        if len(game["players"]) < 5:
            return await interaction.response.send_message("Minimum 5 players required to start!", ephemeral=True)

        game["started"] = True
        game["alive"] = game["players"].copy()
        game["round"] = 1

        imposter_count = 1 if len(game["players"]) < 8 else 2
        game["imposters"] = random.sample(game["players"], imposter_count)

        # DM roles
        for pid in game["players"]:
            user = await bot.fetch_user(pid)
            try:
                if pid in game["imposters"]:
                    await user.send("🤫 **You are an IMPOSTER!**\nLie to everyone and eliminate the Crewmates. Don't get caught!")
                else:
                    await user.send("👨‍🚀 **You are a CREWMATE!**\nFind out who the Imposters are and vote them out.")
            except:
                await interaction.channel.send(f"Could not DM {user.mention}. DMs might be disabled.")

        save_data()

        # Update embed after start
        alive_list = "\n".join([f"<@{pid}>" for pid in game["alive"]])
        embed = discord.Embed(
            title="🎭 Find Imposters - Game Started!",
            description=f"**Round {game['round']}**\n**{len(game['players'])} members participated**\n\n**Alive Players:**\n{alive_list}\n\nRoles have been sent via DM. Discuss and vote!",
            color=0x3498DB
        )
        embed.set_footer(text=f"Imposters: {imposter_count} | Crewmates: {len(game['players']) - imposter_count}")

        # Vote dropdown
        options = [
            discord.SelectOption(label=interaction.guild.get_member(pid).name, value=str(pid), description="Vote to eliminate")
            for pid in game["alive"] if interaction.guild.get_member(pid)
        ]
        select = discord.ui.Select(
            placeholder="Select who to vote out",
            custom_id=f"imposter_vote_{self.channel_id}",
            options=options
        )
        view = discord.ui.View()
        view.add_item(select)

        await interaction.response.edit_message(embed=embed, view=view)

async def create_imposter_lobby(interaction, user):
    channel_id = str(interaction.channel_id)
    if channel_id in game_data["imposter"]:
        msg = "An Imposter lobby already exists in this channel!"
        return await interaction.response.send_message(msg, ephemeral=True) if hasattr(interaction, 'response') else await interaction.reply(msg, ephemeral=True)

    game_data["imposter"][channel_id] = {
        "players": [user.id],
        "started": False,
        "host": user.id,
        "votes": {},
        "imposters": [],
        "alive": [],
        "round": 0
    }
    save_data()

    embed = discord.Embed(
        title="🎭 Find Imposters Lobby",
        description=f"**Minimum 5 Players | Maximum: Unlimited**\nHost: {user.mention}\n\nJoin or Leave using buttons. Only host can start the game.",
        color=0x3498DB
    )
    embed.add_field(name="Players [1/5]", value=f"{user.mention}")

    if hasattr(interaction, 'response'):
        await interaction.response.send_message(embed=embed, view=ImposterLobbyView(channel_id))
    else:
        await interaction.reply(embed=embed, view=ImposterLobbyView(channel_id))

# ===== RUMBLE GAME =====
class RumbleLobbyView(discord.ui.View):
    def __init__(self, channel_id):
        super().__init__(timeout=None)
        self.channel_id = str(channel_id)

    @discord.ui.button(label="Join", style=discord.ButtonStyle.success, emoji="➕")
    async def join(self, interaction: discord.Interaction, button: discord.ui.Button):
        game = game_data["rumble"].get(self.channel_id)
        if not game or game["started"]:
            return await interaction.response.send_message("Lobby is closed.", ephemeral=True)
        if interaction.user.id in game["players"]:
            return await interaction.response.send_message("You already joined!", ephemeral=True)

        game["players"].append(interaction.user.id)
        save_data()

        embed = discord.Embed(
            title="💥 Rumble Lobby",
            description=f"**Minimum 4 Players | Maximum: Unlimited**\nHost: <@{game['host']}>",
            color=0x3498DB
        )
        embed.add_field(name=f"Players [{len(game['players'])}/4]", value="\n".join([f"<@{pid}>" for pid in game["players"]]))
        await interaction.response.edit_message(embed=embed)

    @discord.ui.button(label="Leave", style=discord.ButtonStyle.danger, emoji="➖")
    async def leave(self, interaction: discord.Interaction, button: discord.ui.Button):
        game = game_data["rumble"].get(self.channel_id)
        if interaction.user.id not in game["players"]:
            return await interaction.response.send_message("You are not in the lobby!", ephemeral=True)
        if interaction.user.id == game["host"]:
            return await interaction.response.send_message("Host cannot leave!", ephemeral=True)

        game["players"].remove(interaction.user.id)
        save_data()

        embed = discord.Embed(
            title="💥 Rumble Lobby",
            description=f"**Minimum 4 Players | Maximum: Unlimited**\nHost: <@{game['host']}>",
            color=0x3498DB
        )
        embed.add_field(name=f"Players [{len(game['players'])}/4]", value="\n".join([f"<@{pid}>" for pid in game["players"]]) or "None")
        await interaction.response.edit_message(embed=embed)

    @discord.ui.button(label="Start Rumble", style=discord.ButtonStyle.primary, emoji="💥")
    async def start(self, interaction: discord.Interaction, button: discord.ui.Button):
        game = game_data["rumble"].get(self.channel_id)
        if interaction.user.id!= game["host"]:
            return await interaction.response.send_message("Only the host can start!", ephemeral=True)
        if len(game["players"]) < 4:
            return await interaction.response.send_message("Minimum 4 players required!", ephemeral=True)

        winner = random.choice(game["players"])
        embed = discord.Embed(
            title="💥 RUMBLE WINNER 💥",
            description=f"**<@{winner}>** defeated everyone!\n\nTotal players: {len(game['players'])}",
            color=0xFFD700
        )

        del game_data["rumble"][self.channel_id]
        save_data()
        await interaction.response.edit_message(embed=embed, view=None)

async def create_rumble_lobby(interaction, user):
    channel_id = str(interaction.channel_id)
    if channel_id in game_data["rumble"]:
        msg = "A Rumble lobby already exists in this channel!"
        return await interaction.response.send_message(msg, ephemeral=True) if hasattr(interaction, 'response') else await interaction.reply(msg, ephemeral=True)

    game_data["rumble"][channel_id] = {
        "players": [user.id],
        "started": False,
        "host": user.id
    }
    save_data()

    embed = discord.Embed(
        title="💥 Rumble Lobby",
        description=f"**Minimum 4 Players | Maximum: Unlimited**\nHost: {user.mention}\n\nOnly host can start the game.",
        color=0x3498DB
    )
    embed.add_field(name="Players [1/4]", value=f"{user.mention}")

    view = RumbleLobbyView(channel_id)
    if hasattr(interaction, 'response'):
        await interaction.response.send_message(embed=embed, view=view)
    else:
        await interaction.reply(embed=embed, view=view)

# ===== RPS - 15s EPHEMERAL =====
class RPSView(discord.ui.View):
    def __init__(self, p1_id, p2_id, msg_id):
        super().__init__(timeout=15)
        self.p1_id = p1_id
        self.p2_id = p2_id
        self.msg_id = str(msg_id)

    async def interaction_check(self, interaction):
        return interaction.user.id in [self.p1_id, self.p2_id]

    @discord.ui.button(label="Rock", emoji="🪨", style=discord.ButtonStyle.secondary)
    async def rock(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.make_choice(interaction, "Rock")

    @discord.ui.button(label="Paper", emoji="📄", style=discord.ButtonStyle.secondary)
    async def paper(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.make_choice(interaction, "Paper")

    @discord.ui.button(label="Scissors", emoji="✂️", style=discord.ButtonStyle.secondary)
    async def scissors(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.make_choice(interaction, "Scissors")

    async def make_choice(self, interaction, choice):
        game = game_data["rps"].get(self.msg_id)
        if not game:
            return await interaction.response.send_message("Game expired.", ephemeral=True)

        if interaction.user.id == self.p1_id:
            game["c1"] = choice
        elif interaction.user.id == self.p2_id:
            game["c2"] = choice

        save_data()
        await interaction.response.send_message(f"You chose **{choice}**! Waiting for result...", ephemeral=True)

    async def on_timeout(self):
        game = game_data["rps"].get(self.msg_id)
        if not game:
            return

        c1, c2 = game["c1"], game["c2"]
        if not c1 and not c2:
            result = "Both players AFK. Draw!"
        elif not c1:
            result = f"<@{game['p2']}> wins! <@{game['p1']}> did not choose."
        elif not c2:
            result = f"<@{game['p1']}> wins! <@{game['p2']}> did not choose."
        else:
            beats = {"Rock": "Scissors", "Paper": "Rock", "Scissors": "Paper"}
            if c1 == c2:
                result = "It's a Draw! 🤝"
            elif beats[c1] == c2:
                result = f"<@{game['p1']}> wins! 🎉"
            else:
                result = f"<@{game['p2']}> wins! 🎉"

        embed = discord.Embed(
            title="✂️ RPS Result",
            description=f"<@{game['p1']}>: **{c1 or 'No choice'}**\n<@{game['p2']}>: **{c2 or 'No choice'}**\n\n{result}",
            color=0x3498DB
        )

        channel = bot.get_channel(int(self.msg_id.split('-')[0]))
        msg = await channel.fetch_message(int(self.msg_id.split('-')[1]))
        await msg.edit(embed=embed, view=None)
        del game_data["rps"][self.msg_id]
        save_data()

async def start_rps(interaction, p1, p2):
    if p2.bot or p2.id == p1.id:
        msg = "Please tag a valid opponent!"
        return await interaction.response.send_message(msg, ephemeral=True) if hasattr(interaction, 'response') else await interaction.reply(msg, ephemeral=True)

    embed = discord.Embed(
        title="✂️ Rock Paper Scissors",
        description=f"{p1.mention} VS {p2.mention}\n\n**You have 15 seconds!** Buttons below are only visible to you both.",
        color=0x3498DB
    )

    if hasattr(interaction, 'response'):
        await interaction.response.send_message(embed=embed)
        msg = await interaction.original_response()
    else:
        msg = await interaction.reply(embed=embed)
        msg = await interaction.channel.fetch_message(msg.id)

    game_key = f"{msg.channel.id}-{msg.id}"
    game_data["rps"][game_key] = {"p1": p1.id, "p2": p2.id, "c1": None, "c2": None}
    save_data()

    view = RPSView(p1.id, p2.id, game_key)
    await interaction.followup.send("Choose your move - 15 seconds!", view=view, ephemeral=True)

# ===== SLASH COMMANDS =====
@bot.event
async def on_ready():
    print(f"{bot.user} is online!")
    bot.add_view(GamesPanel())
    await bot.change_presence(activity=discord.Game(name="created by kitaryo senpai"))
    try:
        synced = await bot.tree.sync()
        print(f"Synced {len(synced)} commands")
    except Exception as e:
        print(e)
        
@bot.tree.command(name="games", description="Open the games panel")
async def games_slash(interaction: discord.Interaction):
    await send_games_panel(interaction)

@bot.tree.command(name="imposter", description="Create Find Imposters lobby")
async def imposter_slash(interaction: discord.Interaction):
    await create_imposter_lobby(interaction, interaction.user)

@bot.tree.command(name="rumble", description="Create Rumble lobby")
async def rumble_slash(interaction: discord.Interaction):
    await create_rumble_lobby(interaction, interaction.user)

@bot.tree.command(name="rps", description="Play Rock Paper Scissors")
@app_commands.describe(opponent="Your opponent")
async def rps_slash(interaction: discord.Interaction, opponent: discord.Member):
    await start_rps(interaction, interaction.user, opponent)

@bot.tree.command(name="av", description="Show user avatar")
@app_commands.describe(user="User to show")
async def av_slash(interaction: discord.Interaction, user: discord.Member = None):
    user = user or interaction.user
    embed = discord.Embed(title=f"{user.name}'s Avatar", color=0x3498DB)
    embed.set_image(url=user.display_avatar.url)
    await interaction.response.send_message(embed=embed)

@bot.tree.command(name="mute", description="Timeout a user for 10 mins")
@app_commands.describe(user="User to mute")
@app_commands.checks.has_permissions(moderate_members=True)
async def mute_slash(interaction: discord.Interaction, user: discord.Member):
    await user.timeout(discord.utils.utcnow() + discord.timedelta(minutes=10), reason=f"Muted by {interaction.user}")
    await interaction.response.send_message(f"✅ {user.mention} has been muted for 10 minutes.")

@bot.tree.command(name="unmute", description="Remove timeout from user")
@app_commands.describe(user="User to unmute")
@app_commands.checks.has_permissions(moderate_members=True)
async def unmute_slash(interaction: discord.Interaction, user: discord.Member):
    await user.timeout(None)
    await interaction.response.send_message(f"✅ {user.mention} has been unmuted.")

@bot.tree.command(name="ban", description="Ban a user")
@app_commands.describe(user="User to ban")
@app_commands.checks.has_permissions(ban_members=True)
async def ban_slash(interaction: discord.Interaction, user: discord.Member):
    await interaction.guild.ban(user, reason=f"Banned by {interaction.user}")
    await interaction.response.send_message(f"✅ {user.name} has been banned.")

@bot.tree.command(name="unban", description="Unban a user")
@app_commands.describe(userid="User ID to unban")
@app_commands.checks.has_permissions(ban_members=True)
async def unban_slash(interaction: discord.Interaction, userid: str):
    user = await bot.fetch_user(int(userid))
    await interaction.guild.unban(user)
    await interaction.response.send_message(f"✅ {user.name} has been unbanned.")

# ===== PREFIX COMMANDS =====
@bot.command(name="games")
async def games_prefix(ctx):
    await send_games_panel(ctx)

@bot.command(name="imposter")
async def imposter_prefix(ctx):
    await create_imposter_lobby(ctx, ctx.author)

@bot.command(name="rumble")
async def rumble_prefix(ctx):
    await create_rumble_lobby(ctx, ctx.author)

@bot.command(name="rps")
async def rps_prefix(ctx, opponent: discord.Member):
    await start_rps(ctx, ctx.author, opponent)

@bot.command(name="av", aliases=["avatar"])
async def av_prefix(ctx, user: discord.Member = None):
    user = user or ctx.author
    embed = discord.Embed(title=f"{user.name}'s Avatar", color=0x3498DB)
    embed.set_image(url=user.display_avatar.url)
    await ctx.reply(embed=embed)

@bot.command(name="mute")
@commands.has_permissions(moderate_members=True)
async def mute_prefix(ctx, member: discord.Member):
    await member.timeout(discord.utils.utcnow() + discord.timedelta(minutes=10), reason=f"Muted by {ctx.author}")
    await ctx.reply(f"✅ {member.mention} muted for 10 minutes.")

@bot.command(name="unmute")
@commands.has_permissions(moderate_members=True)
async def unmute_prefix(ctx, member: discord.Member):
    await member.timeout(None)
    await ctx.reply(f"✅ {member.mention} unmuted.")

@bot.command(name="ban")
@commands.has_permissions(ban_members=True)
async def ban_prefix(ctx, member: discord.Member):
    await member.ban(reason=f"Banned by {ctx.author}")
    await ctx.reply(f"✅ {member.name} banned.")

@bot.command(name="unban")
@commands.has_permissions(ban_members=True)
async def unban_prefix(ctx, user_id: int):
    user = await bot.fetch_user(user_id)
    await ctx.guild.unban(user)
    await ctx.reply(f"✅ {user.name} unbanned.")

# ===== INTERACTION HANDLER =====
@bot.event
async def on_interaction(interaction):
    if interaction.type == discord.InteractionType.component:
        custom_id = interaction.data.get("custom_id", "")

        # Main panel
        if custom_id == "imposter_start":
            await create_imposter_lobby(interaction, interaction.user)
        elif custom_id == "rumble_start":
            await create_rumble_lobby(interaction, interaction.user)

        # Imposter buttons
        elif custom_id.startswith("imposter_"):
            parts = custom_id.split("_")
            action = parts[1]
            channel_id = parts[2]
            game = game_data["imposter"].get(channel_id)

            if action == "join":
                if not game or game["started"]:
                    return await interaction.response.send_message("Lobby is closed or game already started.", ephemeral=True)
                if interaction.user.id in game["players"]:
                    return await interaction.response.send_message("You already joined!", ephemeral=True)

                game["players"].append(interaction.user.id)
                save_data()

                embed = discord.Embed(
                    title="🎭 Find Imposters Lobby",
                    description=f"**Minimum 5 Players | Maximum: Unlimited**\nHost: <@{game['host']}>",
                    color=0x3498DB
                )
                embed.add_field(name=f"Players [{len(game['players'])}/5]", value="\n".join([f"<@{pid}>" for pid in game["players"]]))
                await interaction.response.edit_message(embed=embed)

            elif action == "leave":
                if interaction.user.id not in game["players"]:
                    return await interaction.response.send_message("You are not in the lobby!", ephemeral=True)
                if interaction.user.id == game["host"]:
                    return await interaction.response.send_message("Host cannot leave! Delete the lobby by not starting.", ephemeral=True)

                game["players"].remove(interaction.user.id)
                save_data()

                embed = discord.Embed(
                    title="🎭 Find Imposters Lobby",
                    description=f"**Minimum 5 Players | Maximum: Unlimited**\nHost: <@{game['host']}>",
                    color=0x3498DB
                )
                embed.add_field(name=f"Players [{len(game['players'])}/5]", value="\n".join([f"<@{pid}>" for pid in game["players"]]) or "None")
                await interaction.response.edit_message(embed=embed)

            elif action == "start":
                if interaction.user.id!= game["host"]:
                    return await interaction.response.send_message("Only the host can start the game!", ephemeral=True)
                if len(game["players"]) < 5:
                    return await interaction.response.send_message("Minimum 5 players required to start!", ephemeral=True)

                game["started"] = True
                game["alive"] = game["players"].copy()
                game["round"] = 1

                imposter_count = 1 if len(game["players"]) < 8 else 2
                game["imposters"] = random.sample(game["players"], imposter_count)

                # DM roles
                for pid in game["players"]:
                    user = await bot.fetch_user(pid)
                    try:
                        if pid in game["imposters"]:
                            await user.send("🤫 **You are an IMPOSTER!**\nLie to everyone and eliminate the Crewmates. Don't get caught!")
                        else:
                            await user.send("👨‍🚀 **You are a CREWMATE!**\nFind out who the Imposters are and vote them out.")
                    except:
                        await interaction.channel.send(f"Could not DM {user.mention}. DMs might be disabled.")

                save_data()

                alive_list = "\n".join([f"<@{pid}>" for pid in game["alive"]])
                embed = discord.Embed(
                    title="🎭 Find Imposters - Game Started!",
                    description=f"**Round {game['round']}**\n**{len(game['players'])} members participated**\n\n**Alive Players:**\n{alive_list}\n\nRoles have been sent via DM. Discuss and vote!",
                    color=0x3498DB
                )
                embed.set_footer(text=f"Imposters: {imposter_count} | Crewmates: {len(game['players']) - imposter_count}")

                options = [
                    discord.SelectOption(label=interaction.guild.get_member(pid).name, value=str(pid), description="Vote to eliminate")
                    for pid in game["alive"] if interaction.guild.get_member(pid)
                ]
                select = discord.ui.Select(
                    placeholder="Select who to vote out",
                    custom_id=f"imposter_vote_{channel_id}",
                    options=options
                )
                view = discord.ui.View()
                view.add_item(select)

                await interaction.response.edit_message(embed=embed, view=view)

        # Rumble buttons
        elif custom_id.startswith("rumble_"):
            parts = custom_id.split("_")
            action = parts[1]
            channel_id = parts[2]
            game = game_data["rumble"].get(channel_id)

            if action == "join":
                if not game or game["started"]:
                    return await interaction.response.send_message("Lobby is closed.", ephemeral=True)
                if interaction.user.id in game["players"]:
                    return await interaction.response.send_message("You already joined!", ephemeral=True)

                game["players"].append(interaction.user.id)
                save_data()

                embed = discord.Embed(
                    title="💥 Rumble Lobby",
                    description=f"**Minimum 4 Players | Maximum: Unlimited**\nHost: <@{game['host']}>",
                    color=0x3498DB
                )
                embed.add_field(name=f"Players [{len(game['players'])}/4]", value="\n".join([f"<@{pid}>" for pid in game["players"]]))
                await interaction.response.edit_message(embed=embed)

            elif action == "leave":
                if interaction.user.id not in game["players"]:
                    return await interaction.response.send_message("You are not in the lobby!", ephemeral=True)
                if interaction.user.id == game["host"]:
                    return await interaction.response.send_message("Host cannot leave!", ephemeral=True)

                game["players"].remove(interaction.user.id)
                save_data()

                embed = discord.Embed(
                    title="💥 Rumble Lobby",
                    description=f"**Minimum 4 Players | Maximum: Unlimited**\nHost: <@{game['host']}>",
                    color=0x3498DB
                )
                embed.add_field(name=f"Players [{len(game['players'])}/4]", value="\n".join([f"<@{pid}>" for pid in game["players"]]) or "None")
                await interaction.response.edit_message(embed=embed)

            elif action == "start":
                if interaction.user.id!= game["host"]:
                    return await interaction.response.send_message("Only the host can start!", ephemeral=True)
                if len(game["players"]) < 4:
                    return await interaction.response.send_message("Minimum 4 players required!", ephemeral=True)

                winner = random.choice(game["players"])
                embed = discord.Embed(
                    title="💥 RUMBLE WINNER 💥",
                    description=f"**<@{winner}>** defeated everyone!\n\nTotal players: {len(game['players'])}",
                    color=0xFFD700
                )

                del game_data["rumble"][channel_id]
                save_data()
                await interaction.response.edit_message(embed=embed, view=None)

        # RPS buttons
        elif custom_id.startswith("rps_"):
            parts = custom_id.split("_")
            choice = parts[1].capitalize()
            p1_id = int(parts[2])
            p2_id = int(parts[3])

            msg_id = f"{interaction.channel_id}-{interaction.message.id}"
            game = game_data["rps"].get(msg_id)
            if not game:
                return await interaction.response.send_message("Game expired.", ephemeral=True)

            if interaction.user.id == p1_id:
                game["c1"] = choice
            elif interaction.user.id == p2_id:
                game["c2"] = choice
            else:
                return await interaction.response.send_message("You are not in this game.", ephemeral=True)

            save_data()
            await interaction.response.send_message(f"You chose **{choice}**! Waiting for result...", ephemeral=True)

    elif interaction.type == discord.InteractionType.component and interaction.data["component_type"] == 3:
        # String Select Menu - Imposter Vote
        custom_id = interaction.data["custom_id"]
        if custom_id.startswith("imposter_vote_"):
            channel_id = custom_id.split("_")[2]
            game = game_data["imposter"].get(channel_id)

            if not game or not game["started"]:
                return await interaction.response.send_message("No active game.", ephemeral=True)
            if interaction.user.id not in game["alive"]:
                return await interaction.response.send_message("You are dead or not in game!", ephemeral=True)

            voted_id = int(interaction.data["values"][0])
            game["votes"][str(interaction.user.id)] = voted_id
            save_data()

            await interaction.response.send_message(f"You voted for <@{voted_id}>!", ephemeral=True)

            # Check if all voted
            if len(game["votes"]) == len(game["alive"]):
                vote_counts = {}
                for v in game["votes"].values():
                    vote_counts[v] = vote_counts.get(v, 0) + 1
                max_votes = max(vote_counts.values())
                eliminated = [int(pid) for pid, cnt in vote_counts.items() if cnt == max_votes]

                result_msg = ""
                if len(eliminated) > 1:
                    result_msg = "**Vote tied! No one was eliminated.**"
                else:
                    elim_id = eliminated[0]
                    game["alive"].remove(elim_id)
                    was_imposter = elim_id in game["imposters"]
                    result_msg = f"<@{elim_id}> was voted out!\nThey were a **{'IMPOSTER' if was_imposter else 'CREWMATE'}**."

                game["votes"] = {}
                game["round"] += 1

                # Win check
                alive_imposters = len([pid for pid in game["alive"] if pid in game["imposters"]])
                alive_crewmates = len(game["alive"]) - alive_imposters

                if alive_imposters == 0:
                    result_msg += "\n\n🎉 **CREWMATES WIN!** All imposters eliminated."
                    del game_data["imposter"][channel_id]
                    end_embed = discord.Embed(title="🎭 Game Over", description=result_msg, color=0x3498DB)
                    save_data()
                    return await interaction.message.edit(embed=end_embed, view=None)
                elif alive_imposters >= alive_crewmates:
                    result_msg += "\n\n🤫 **IMPOSTERS WIN!** They outnumber the crewmates."
                    del game_data["imposter"][channel_id]
                    end_embed = discord.Embed(title="🎭 Game Over", description=result_msg, color=0x3498DB)
                    save_data()
                    return await interaction.message.edit(embed=end_embed, view=None)
                else:
                    # Continue
                    alive_list = "\n".join([f"<@{pid}>" for pid in game["alive"]])
                    embed = discord.Embed(
                        title="🎭 Find Imposters - Game Ongoing",
                        description=f"**Round {game['round']}**\n\n{result_msg}\n\n**Alive Players:**\n{alive_list}",
                        color=0x3498DB
                    )

                    options = [
                        discord.SelectOption(label=interaction.guild.get_member(pid).name, value=str(pid))
                        for pid in game["alive"] if interaction.guild.get_member(pid)
                    ]
                    select = discord.ui.Select(
                        placeholder="Vote for next round",
                        custom_id=f"imposter_vote_{channel_id}",
                        options=options
                    )
                    view = discord.ui.View()
                    view.add_item(select)

                    save_data()
                    await interaction.message.edit(embed=embed, view=view)

keep_alive()
bot.run(TOKEN)

const { Client, Guild, resolveColor } = require("discord.js"),
    { readFileSync, writeFileSync } = require("fs"),
    database = JSON.parse(readFileSync("./data.db")),
    client = new Client({
        intents: 3276799
    }),
    { token, prefix } = require("./config");


client.login(token);
function writeDatabase() {
    writeFileSync("./data.db", JSON.stringify(database));
}
/**
 * @param {String} str 
 * @param {Guild} guild 
 */
async function replace(str, guild, role = false, roleId) {
    const members = await guild.members.fetch();
    if (role) {
        const role = guild.roles.cache.get(roleId);
        let roleMembers = members.filter(m => m.roles.cache.has(role.id));
        str = str.replace("{count}", roleMembers.size.toString());
        return str;
    }
    str = str
        .replace("{members}", guild.memberCount)
        .replace("{bots}", members.filter(m => m.user.bot).size)
        .replace("{humans}", members.filter(m => !m.user.bot).size)
        .replace("{online}", members.filter(m => ["idle", "dnd", "online"].includes(m.presence?.status)).size)
        .replace("{boosts}", guild.premiumSubscriptionCount)
        .replace("{channels}", guild.channels.cache.size)
        .replace("{voice}", guild.voiceStates.cache.size)
    return str;
}

client.on("ready", () => {
    console.log(`Bot compteur connecté en tant que ${client.user.tag} !\nPowered by Nova World !`);
    setInterval(() => {
        const guilds = database.guilds || {};
        for (const guildId in guilds) {
            const guild = client.guilds.cache.get(guildId);
            guilds[guildId].forEach(async counterData => {
                const channel = guild.channels.cache.get(counterData.id);
                if (!channel) return;
                let str = await replace(counterData.name, guild, counterData.type === "role", counterData.roleId);
                channel.setName(str);
            })
        }
    }, 60000);
});

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(prefix)) return;
    const args = message.content.slice(prefix.length).trim().split(/ +/g),
        command = args.shift().toLowerCase();
    if (["counters", "counter", "compteurs"].includes(command)) {
        if (!database.guilds) database.guilds = {};
        const guildData = database.guilds[message.guild.id] || [];
        const msg = await message.channel.send({ embeds: [embed()], components: [components()] });
        const collector = msg.createMessageComponentCollector({
            filter: (i) => {
                if (i.user.id !== message.author.id) {
                    i.reply({ content: "Vous n'avez pas la permission de faire cela !", ephemeral: true });
                    return false;
                }
                return true;
            },
            time: 120000
        });

        collector.on("end", () => {
            msg.edit({ components: [] });
        });
        collector.on("collect", async (interaction) => {
            const { customId } = interaction;
            if (customId === "add") {
                let _embed = {
                    title: "Quel est le type de compteur ?",
                    color: resolveColor("Aqua"),
                };
                let _components = {
                    type: 1,
                    components: [
                        {
                            type: 2,
                            label: "Compteur Classique",
                            style: 2,
                            custom_id: "classic"
                        },
                        {
                            type: 2,
                            label: "Compteur de Rôle",
                            style: 2,
                            custom_id: "role"
                        }
                    ]
                }
                let reply = await interaction.reply({ embeds: [_embed], components: [_components], fetchReply: true });
                const r = await reply.awaitMessageComponent({ time: 30000, filter: (i) => i.user.id === message.author.id });
                r.deferUpdate();
                let type = r.customId;
                let role;
                if (type === "role") {
                    let roleSelector = {
                        type: 1,
                        components: [{
                            type: 6,
                            custom_id: "role-selector",
                            placeholder: "Sélectionnez un rôle",
                        }]
                    }
                    reply.edit({ components: [roleSelector], fetchReply: true, embeds: [] });
                    const _r = await reply.awaitMessageComponent({ time: 30000, filter: (i) => i.user.id === message.author.id });
                    role = _r.roles.first();
                    _r.deferUpdate();
                }
                let channelSelector = {
                    type: 1,
                    components: [
                        {
                            type: 8,
                            custom_id: "channel-selector",
                            placeholder: "Sélectionnez un salon",
                        }
                    ]
                }
                reply.edit({ components: [channelSelector], fetchReply: true, embeds: [] });
                const _collector = reply.createMessageComponentCollector({
                    time: 30000,
                    filter: (i) => i.user.id === message.author.id
                })
                _collector.on("end", () => {
                    reply.delete().catch(() => { });
                })
                _collector.on("collect", async (_interaction) => {
                    let channel = _interaction.channels.first();
                    if (!channel) return;
                    let modal = {
                        title: "Nom du compteur",
                        custom_id: "counter-name-modal",
                        components: [
                            {
                                type: 1,
                                components: [
                                    {
                                        type: 4,
                                        custom_id: "counter-name",
                                        placeholder: "Entrez le nom du compteur",
                                        min_length: 1,
                                        max_length: 100,
                                        required: true,
                                        label: `${channel.name}`,
                                        style: 1
                                    }
                                ]
                            }
                        ]
                    }
                    await _interaction.showModal(modal);
                    const response = await _interaction.awaitModalSubmit({ time: 30000 });
                    response.deferUpdate();
                    const name = response.fields.getTextInputValue("counter-name");
                    if (!name) return;
                    let data = {
                        name,
                        id: channel.id
                    }
                    if (type === "role") {
                        data.roleId = role.id;
                        data.type = "role";
                    }
                    guildData.push(data);
                    database.guilds[message.guild.id] = guildData;
                    writeDatabase();
                    msg.edit({ embeds: [embed()], components: [components()] });
                    _collector.stop();
                    reply.delete().catch(() => { });
                })
            } else if (customId === "remove") {
                let menu = {
                    type: 1,
                    components: [
                        {
                            type: 3,
                            custom_id: "counter-selector",
                            placeholder: "Sélectionnez un/plusieurs compteur(s)",
                            options: guildData.map((counter, i) => {
                                return {
                                    label: counter.name,
                                    value: i.toString(),
                                    description: `Type: ${counter.type === "role" ? "Rôle" : "Classique"}`
                                }
                            }),
                            min_values: 1,
                            max_values: guildData.length,
                        }
                    ]
                }

                let reply = await interaction.reply({ components: [menu], fetchReply: true });
                const r = await reply.awaitMessageComponent({ time: 30000, filter: (i) => i.user.id === message.author.id });
                r.deferUpdate();
                let values = r.values;
                values.forEach(value => {
                    guildData.splice(parseInt(value), 1);
                })
                database.guilds[message.guild.id] = guildData;
                writeDatabase();
                msg.edit({ embeds: [embed()], components: [components()] });
                reply.delete().catch(() => { });

            } else if (customId === "reset") {
                let _c = {
                    type: 1,
                    components: [
                        {
                            type: 2,
                            emoji: { name: "✅" },
                            style: 3,
                            custom_id: "confirm"
                        },
                        {
                            type: 2,
                            emoji: { name: "❌" },
                            style: 4,
                            custom_id: "cancel"
                        }
                    ]
                }

                let _e = {
                    description: "Vous allez reinitialiser tous les compteurs de ce serveur, êtes-vous sûr ?",
                    color: resolveColor("Aqua")
                }
                const reply = await interaction.reply({ embeds: [_e], components: [_c], fetchReply: true });
                const r = await reply.awaitMessageComponent({ time: 30000, filter: (i) => i.user.id === message.author.id });
                r.deferUpdate();
                database.guilds[message.guild.id] = [];
                writeDatabase();
                reply.delete().catch(() => { });
                msg.edit({ embeds: [embed()], components: [components()] });
            }
        })
        function components() {
            return {
                type: 1,
                components: [
                    {
                        type: 2,
                        emoji: { name: "➕" },
                        style: 2,
                        custom_id: "add"
                    },
                    {
                        type: 2,
                        emoji: { name: "➖" },
                        style: 2,
                        custom_id: "remove",
                        disabled: guildData.length === 0
                    },
                    {
                        type: 2,
                        emoji: { name: "🔄" },
                        style: 2,
                        custom_id: "reset"
                    }
                ]
            }
        }
        function embed() {
            let counters = guildData.map(counter => `<${counter.type === "role" ? "@&" : "#"}${counter.type === "role" ? counter.roleId : counter.id}>${counter.type === "role" ? ` - <#${counter.id}>` : ""}: \`${counter.name}\``)
            return {
                title: "Compteurs",
                description: `Voici les compteurs disponibles sur ce serveur :\n ${counters.join("\n") || "Aucun"}`,
                color: resolveColor("Aqua"),
                footer: { text: "Utilisez la commande variables pour voir les variables disponibles." }
            }
        }
    } else if (["var", "variable", "variables"].includes(command)) {
        let embed = {
            title: "Variables",
            description: "Voici les variables disponibles pour les compteurs :",
            fields: [
                {
                    name: "{members}",
                    value: "Nombre de membres sur le serveur",
                    inline: true
                },
                {
                    name: "{bots}",
                    value: "Nombre de bots sur le serveur",
                    inline: true
                },
                {
                    name: "{humans}",
                    value: "Nombre d'humains sur le serveur",
                    inline: true
                },
                {
                    name: "{online}",
                    value: "Nombre de membres en ligne sur le serveur",
                    inline: true
                },
                {
                    name: "{boosts}",
                    value: "Nombre de boosts sur le serveur",
                    inline: true
                },
                {
                    name: "{channels}",
                    value: "Nombre de salons sur le serveur",
                    inline: true
                },
                {
                    name: "{voice}",
                    value: "Nombre de membres en vocal sur le serveur",
                    inline: true
                },
                {
                    name: "{count}",
                    value: "A utiliser uniquement pour les compteurs de rôles, remplace le nombre de membres ayant le rôle",
                    inline: true
                }
            ],
            color: resolveColor("Aqua")
        }
        message.channel.send({ embeds: [embed] })
    } else if (["help", "h"].includes(command)) {
        let embed = {
            title: "Help",
            description: "Voici les commandes disponibles :",
            fields: [
                {
                    name: `\`${prefix}variables\``,
                    value: `Affichez les variables disponibles pour les compteurs\nAlias: \`${prefix}var\``,
                },
                {
                    name: `\`${prefix}compteurs\``,
                    value: `Affichez les compteurs disponibles sur le serveur\nAlias: \`${prefix}counters\``,
                },
                {
                    name: `\`${prefix}help\``,
                    value: `ça!\nAlias: \`${prefix}h\``,
                }
            ],
            color: resolveColor("Aqua"),
            footer: { text: "Powered by Nova World! - discord.gg/novaworld" }
        }

        message.channel.send({ embeds: [embed] })
    }
})
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('config.json'));

if (!fs.existsSync('output')) {
    fs.mkdirSync('output');
}

const https = require('https');
const http = require('http');
http.createServer((req, res) => {
	res.end('A');
}).listen(8080);

const winston = require('winston');
const logger = winston.createLogger({
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'output/log.txt' }),
    ],
    format: winston.format.printf(log => `[${new Date().toLocaleString()}] [${log.level.toUpperCase()}]: ${log.message}`),
});

const Discord = require('discord.js');
const client = new Discord.Client();

function isDev(msg) {
    return msg.author.id === config.developer;
}

function isSuper(msg) {
    if (isDev(msg)) return true;

    return config.superusers.includes(msg.author.id);
}

function isAdmin(msg) {
    if (isSuper(msg)) return true;
    if (!config.adminRoles[msg.guild.id]) return false;

    let hasAdminRole = false;
    config.adminRoles[msg.guild.id].forEach(adminRole => {
        if (msg.member.roles.cache.has(adminRole)) hasAdminRole = true;
    });

    return hasAdminRole;
}

function isMod(msg) {
    if (isAdmin(msg)) return true;
    if (!config.modRoles[msg.guild.id]) return false;

    let hasModRole = false;
    config.modRoles[msg.guild.id].forEach(modRole => {
        if (msg.member.roles.cache.has(modRole)) hasModRole = true;
    });

    return hasModRole;
}

function updateRole(member, memberAfter) {
    if (!config.logChannels[member.guild.id]) return;

    let roleList = [`<@${member.id}>\nAffected roles:\n\`\`\``];
    let cache = member.roles.cache;
    if (memberAfter) {
        cache = member.roles.cache.difference(memberAfter.roles.cache);
    }
    if (!cache) return;
    if (cache.array().length < 1) return;
    cache.each(role => {
        let name = role.name;
        if (name !== '@everyone') {
            roleList.push(`${name} | ${role.hexColor} | User count: ${role.members.array().length}`);
        }
    });

    roleList = roleList.join('\n');
    roleList += '```';
    member.guild.channels.cache.get(config.logChannels[member.guild.id]).send(roleList).catch(e => logger.log('error', e));
}

function failFast(msg, desc, delay = 15000) {
    if (desc) {
        msg.reply(desc).then(() => {
            msg.delete();
            setTimeout(() => msg.delete(), delay);
        }).catch(e => logger.log('error', e));
    } else {
        msg.delete();
    }
}

function dateToGoogle(date) {
    return `${[
        date.getUTCMonth() + 1,
        date.getUTCDate(),
        date.getUTCFullYear()
    ].join('/')} ${[
        date.getUTCHours(),
        date.getUTCMinutes(),
        date.getUTCSeconds()
    ].join(':')}`;
}

process.on('uncaughtException', e => logger.log('error', e));
process.on('unhandledRejection', e => logger.log('error', e));

client.on('ready', () => {
    logger.log('info', `Logged in as ${client.user.tag}!`);

    // TODO copy all messages from member channels on DS to Electric Spongeaboob
    let channels = {};
    client.guilds.cache.get('527796496440098816').channels.cache.sort((c1, c2) => {
        return c1.rawPosition - c2.rawPosition;
    }).filter(channel => {
        return channel.isText();
    }).each(channel => {
        channels[channel.id] = channel.name;
    });
    fs.writeFileSync('./output/channels.json', JSON.stringify(channels));
});

client.on('debug', m => {
    logger.log('debug', m);
});

client.on('warn', m => {
    logger.log('warn', m);
});

client.on('error', e => {
    logger.log('error', e);
});

client.on('guildMemberRemove', member => {
    updateRole(member);
});

client.on('guildMemberUpdate', (oldMember, newMember) => {
    updateRole(oldMember, newMember);
});

client.on('message', msg => {
    let ping = Date.now();

    if (msg.author.bot) return;
    let cmd = msg.content;
    if (!cmd.startsWith(config.starter)) return;
    cmd = cmd.slice(config.starter.length).split(' ');
    if (cmd.length < 1) return;

    switch (cmd[0]) {
        case 'p':
        case 'ping':
            failFast(msg, `${ping - msg.createdAt - client.ws.ping}ms`);

            break;
        case 'h':
        case 'help':
            msg.channel.send(`__**Command Help**__
\`${config.starter}help|h [stay]\` - Print this message. "stay" will prevent it from auto-deleting
\`${config.starter}ping|p\` - Get a rough ping to the bot`
                + (isMod(msg) ? `\n\n**Mod only**
\`${config.starter}listmembers|lm @role1 [@role2 @role3...]\` - List members in one or more roles
\`${config.starter}rolecount|rc\` - List a count of members in each role
\`${config.starter}users|u\` - Create a TSV file of all users on the server to import into Google Sheets` : '')
                + (isAdmin(msg) ? `\n\n**Admin only**
Coming soon:tm:!` : '')
            ).then(m => {
                msg.delete();
                if (cmd[1] !== 'stay') setTimeout(() => m.delete(), 65000);
            }).catch(e => logger.log('error', e));

            break;
        case 'lm':
        case 'listmembers':
            if (!isMod(msg)) {
                logger.log('info', `${msg.author.tag} (${msg.author.id}) attemted to execute ${cmd} without permission`);
                failFast(msg, 'you lack sufficient privileges');
                return;
            }
            if (!msg.mentions.roles.array().length) {
                failFast(msg, `proper usage: \`${config.starter}${cmd[0]} @role1 [@role2 @role3...]\``, 25000);
                return;
            }

            let out = [];
            msg.mentions.roles.each(role => {
                out.push(`Members for @${role.name}:`);
                role.members.each(member => {
                    out.push(`${member.displayName} (${member.user.tag}) | Account creation: ${member.user.createdAt.toDateString()} | Joined on: ${member.joinedAt.toDateString()}`);
                });
            });
            fs.writeFileSync('./output/listmembers.txt', out.join('\n'));
                
            msg.reply(`completed ${cmd[0]} in ${Date.now() - ping}ms`, {
                files: [ './output/listmembers.txt' ]
            }).then(() => msg.delete()).catch(e => logger.log('error', e));

            break;
        case 'rc':
        case 'rolecount':
            if (!isMod(msg)) {
                logger.log('info', `${msg.author.tag} (${msg.author.id}) attemted to execute ${cmd} without permission`);
                failFast(msg, 'you lack sufficient privileges');
                return;
            }

            msg.guild.roles.fetch().then(roles => {
                let count = [];
                roles.cache.each(role => {
                    let name = role.name;
                    if (name === '@everyone') {
                        name = 'Total';
                    }
                    count.push([ name, role.members.array().length ].join(' | '));
                });
                fs.writeFileSync('./output/rolecount.txt', count.join('\n'));
                
                msg.reply(`completed ${cmd[0]} in ${Date.now() - ping}ms`, {
                    files: [ './output/rolecount.txt' ]
                }).then(() => msg.delete()).catch(e => logger.log('error', e));
            }).catch(e => logger.log('error', e));

            break;
        case 'u':
        case 'users':
            if (!isMod(msg)) {
                logger.log('info', `${msg.author.tag} (${msg.author.id}) attemted to execute ${cmd} without permission`);
                failFast(msg, 'you lack sufficient privileges');
                return;
            }

            msg.guild.members.fetch().then(members => {
                fs.writeFileSync('./output/users.txt', 'id\ttag\tnick\trank\tcreated\tjoined\tlastMessage\tlastBoost\tavatar');

                members.filter(member => !member.deleted && !member.user.bot).each(member => {
                    let rank = member.roles.cache.filter(role => 
                        config.rankRoles[msg.guild.id].includes(role.id) ||
                        config.modRoles[msg.guild.id].includes(role.id) ||
                        config.adminRoles[msg.guild.id].includes(role.id)
                    ).sort(role => role.position).first();

                    fs.appendFileSync('./output/users.txt',  '\n' + [
                        member.id,
                        member.user.tag,
                        member.displayName,
                        rank ? rank.name : '',
                        dateToGoogle(member.user.createdAt),
                        dateToGoogle(member.joinedAt),
                        member.lastMessage ? dateToGoogle(member.lastMessage.createdAt) : '',
                        member.premiumSince ? dateToGoogle(member.premiumSince) : '',
                        member.user.displayAvatarURL(),
                    ].join('\t'));
                });

                msg.reply(`completed ${cmd[0]} in ${Date.now() - ping}ms`, {
                    files: [ './output/users.txt' ]
                }).this(() => msg.delete()).catch(e => logger.log('error', e));
            }).catch(e => logger.log('error', e));

            break;
        case 'bd':
        case 'bulkdelete':
            if (!isSuper(msg)) {
                logger.log('info', `${msg.author.tag} (${msg.author.id}) attemted to execute ${cmd} without permission`);
                failFast(msg, 'you lack sufficient privileges');
                return;
            }
            if (cmd.length < 2) {
                failFast(msg, `proper usage: \`${config.starter}${cmd[0]} 2-100\``, 25000);
                return;
            }
            let count = parseInt(cmd[1], 10);
            if (!count) {
                failFast(msg, `"${cmd[1]}" is not an integer`);
                return;
            }
            if (count < 2 || count > 100) {
                failFast(msg, `${cmd[1]} is not between 2 and 100`);
                return;
            }

            msg.channel.bulkDelete(count).then(messages => {
                if (config.deletedMessageChannels[msg.guild.id]) {
                    fs.writeFileSync('./output/bulkdeleted.json', JSON.stringify([...messages.values()]));
                    msg.guild.channels.cache.get(config.deletedMessageChannels[msg.guild.id]).send(`Completed ${cmd[0]} ${cmd[1]} in ${Date.now() - ping}ms`, {
                        files: [ './output/bulkdeleted.json' ]
                    }).catch(e => logger.log('error', e));
                }
            }).catch(e => logger.log('error', e));

            break;
    }
});

client.login(config.token);

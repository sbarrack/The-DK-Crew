const { logger, config, saveConfig, isOwner } = require('../utils.js')

module.exports = {
    name: 'adminrole',
    short: 'ar',
    desc: 'Sets the administrator role',
    args: 'set [role_name|@role|role_id] | create (role_name) | clear',
    perm: 'owner',
    execute(msg, arg) {
        if (!(isOwner(msg) && arg)) return
        let id = ''

        switch (arg[0]) {
            case 'clear':
                id = config[msg.guild.id].adminRole
                if (id) {
                    config[msg.guild.id].adminRole = ''
                    saveConfig()
                    msg.channel.send(`Removed <@&${id}>`).catch((e) => logger.error(e.stack))
                }

                break
            case 'create':
                msg.guild.roles
                    .create({
                        data: {
                            name: arg[1] ? arg.slice(1).join(' ') : 'Admin',
                            permissions: 0,
                            mentionable: false
                        },
                        reason: `Auto-generated by ${msg.author.username}`
                    })
                    .then((role) => {
                        config[msg.guild.id].adminRole = role.id
                        saveConfig()
                        msg.channel
                            .send(`Role set to <@&${role.id}>`)
                            .catch((e) => logger.error(e.stack))
                    })
                    .catch((e) =>
                        msg.channel.send(e.message).catch((e) => logger.error(e.stack))
                    )

                break
            case 'set':
                id = msg.mentions.roles.first()
                if (id) {
                    id = id.id
                } else if (arg[1]) {
                    id = msg.guild.roles.cache.get(arg[1])
                    if (id) {
                        id = id.id
                    } else {
                        id = msg.guild.roles.cache.findKey(
                            (role) =>
                                role.name.toLowerCase() ===
                                arg.slice(1).join(' ').toLowerCase()
                        )
                    }
                }
                if (id) {
                    config[msg.guild.id].adminRole = id
                    saveConfig()
                    msg.channel
                        .send(`Role set to <@&${id}>`)
                        .catch((e) => logger.error(e.stack))
                } else {
                    msg.channel
                        .send('Invalid role supplied :(')
                        .catch((e) => logger.error(e.stack))
                }
        }
    }
}

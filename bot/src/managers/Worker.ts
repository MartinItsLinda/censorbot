import { Worker, PermissionsUtils, CachedGuild } from 'discord-rose'
import { Config } from '../config'

import { Database } from '../structures/Database'
import { Filter } from '../structures/Filter'
import { ActionBucket } from '../structures/ActionBucket'
import { Responses } from '../structures/Responses'

import { PerspectiveApi } from '../structures/ai/PerspectiveApi'
import { AntiNSFW } from '../structures/ai/AntiNSFW'

import { PunishmentManager } from '../structures/punishments/PunishmentManager'

import { APIRole, GatewayGuildMemberAddDispatchData, Snowflake } from 'discord-api-types'

import { addHandlers } from '../helpers/clusterEvents'
import { setupFilters } from '../helpers/setupFilters'
import { setupDiscord } from '../helpers/discordEvents'

import { Interface } from 'interface'

import fetch from 'node-fetch'
import path from 'path'

import Collection from '@discordjs/collection'

export class WorkerManager extends Worker {
  config = Config
  filter = new Filter()
  db = new Database()

  actions = new ActionBucket(this)
  responses = new Responses(this)

  perspective = new PerspectiveApi()
  images = new AntiNSFW()

  punishments = new PunishmentManager(this)

  interface = new Interface()

  constructor () {
    super()

    this.interface.setupWorker(this)

    this.setStatus(this.config.custom.status?.[0] ?? 'watching', this.config.custom.status?.[1] ?? 'For Bad Words')

    this.commands
      .prefix(async (msg): Promise<string | string[]> => {
        const prefix = await this.db.config(msg.guild_id as Snowflake).then(x => x.prefix)
        // @ts-expect-error
        if (!prefix) return null
        return prefix
      })
      .middleware(async (ctx) => {
        if (!ctx.guild) return true
        ctx.db = await this.db.config(ctx.guild.id)

        return true
      })

    addHandlers(this)
    setupFilters(this)
    setupDiscord(this)

    console.log = (...msg: string[]) => this.comms.log(msg.join(' '))

    this.loadCommands()
  }

  public async isAdmin (id: Snowflake): Promise<boolean> {
    return await fetch(`https://jpbbots.org/api/admin/${id}`).then(async x => await x.text()).then(x => !!Number(x))
  }

  public loadCommands (): void {
    console.log('Loading commands')
    if (this.commands.commands) this.commands.commands.clear()

    this.interface.addCommands(this)

    this.commands.load(path.resolve(__dirname, '../commands'))
  }

  hasPerms (id: Snowflake, perms: keyof typeof PermissionsUtils.bits, channel?: Snowflake): boolean {
    return PermissionsUtils.has(PermissionsUtils.combine({
      guild: this.guilds.get(id) as CachedGuild,
      member: this.selfMember.get(id) as GatewayGuildMemberAddDispatchData,
      roleList: this.guildRoles.get(id) as Collection<Snowflake, APIRole>,
      overwrites: channel ? this.channels.get(channel)?.permission_overwrites : undefined
    }), perms)
  }
}
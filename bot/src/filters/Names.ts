import { WorkerManager } from '../managers/Worker'

import { FilterResponse } from '../structures/Filter'

import { GatewayGuildMemberUpdateDispatchData, GatewayGuildMemberAddDispatchData } from 'discord-api-types'

import { CensorMethods, GuildDB, PunishmentType } from 'typings/api'

const inappName = 'Innapropriate name'
const deHoist = String.fromCharCode(848)

type EventData = GatewayGuildMemberUpdateDispatchData | GatewayGuildMemberAddDispatchData

function handleCensor (worker: WorkerManager, member: EventData, db: GuildDB, response: FilterResponse): void {
  if (!member.user) return

  if (!worker.hasPerms(member.guild_id, 'manageNicknames') && db.log) {
    return void worker.responses.errorLog(db.log, 'Missing permissions to Manage Nicknames')
  }
  if (db.log && worker.channels.has(db.log)) {
    void worker.responses.log(CensorMethods.Names, member.nick ?? member.user.username, member, response, db.log)
  }
  void worker.api.members.setNickname(member.guild_id, member.user.id, member.nick ? null : inappName)

  if (db.punishment.type !== PunishmentType.Nothing) {
    switch (db.punishment.type) {
      case PunishmentType.Mute:
        if (!worker.hasPerms(member.guild_id, 'manageRoles')) return
        break
      case PunishmentType.Kick:
        if (!worker.hasPerms(member.guild_id, 'kick')) return
        break
      case PunishmentType.Ban:
        if (!worker.hasPerms(member.guild_id, 'ban')) return
        break
    }

    void worker.punishments.punish(member.guild_id, member.user.id)
  }
}

export async function NameHandler (worker: WorkerManager, member: EventData): Promise<void> {
  if (
    !member ||
    !member.user ||
    member.user.bot
  ) return

  const db = await worker.db.config(member.guild_id)

  const name = member.nick ?? member.user.username

  if (db.antiHoist) {
    if (name.charCodeAt(0) < 65) {
      return void worker.api.members.setNickname(member.guild_id, member.user.id, `${deHoist}${name}`)
    }
  }

  if (
    (db.censor & CensorMethods.Names) === 0 ||
    member.roles.some(role => db.role?.includes(role))
  ) return

  if (member.nick === inappName) return

  const res = worker.filter.test(name, db)

  if (!res.censor) return

  handleCensor(worker, member, db, res)
}

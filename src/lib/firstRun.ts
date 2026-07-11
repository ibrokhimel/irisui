/**
 * A desktop install is a fresh origin: its IndexedDB starts empty, so chats,
 * knowledge bases and settings created in the web version do not follow the
 * user across. Backup export/import (Settings → Data) is the bridge, so on the
 * first desktop launch we point the user at it — once, then never again.
 */
export const MIGRATION_NOTICE_KEY = 'iris.migration-notice-dismissed'

export function shouldShowMigrationNotice(
  isTauriEnv: boolean,
  storage: Pick<Storage, 'getItem'>,
): boolean {
  if (!isTauriEnv) return false
  return storage.getItem(MIGRATION_NOTICE_KEY) === null
}

export function dismissMigrationNotice(storage: Pick<Storage, 'setItem'>): void {
  storage.setItem(MIGRATION_NOTICE_KEY, '1')
}

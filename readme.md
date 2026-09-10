# pgsqlio

**Backup and restore PostgreSQL from a terminal menu.**

Paste a connection URL. Pick dump, restore, cleanup, or drop. No flags to memorize, no subcommands to look up.

```bash
bunx pgsqlio
# or
npx pgsqlio
```

![pgsqlio](./assets/cli.png)

You need `pg_dump` and `psql` on your `PATH` (the PostgreSQL client tools), plus [Bun](https://bun.sh) 1.3+ or Node.js 26.4+.

---

## What you can do

| | |
| --- | --- |
| **Dump** | Back up one database or many, into separate files or one combined file |
| **Restore** | Load a `.sql` backup — wipe first if the target already has tables |
| **Cleanup** | Empty a database’s `public` schema without dropping the database itself |
| **Drop** | Pick databases from a list and delete them for good |

Start `pgsqlio`, then choose from the menu. Arrow keys move, Enter confirms, Esc goes back, Ctrl+C quits.

---

## Connection URL

Host-only URLs are fine for dump and drop. Cleanup needs a database name on the URL.

```text
postgresql://user:password@host:5432
postgresql://user:password@host:5432/mydb
postgresql://postgres@127.0.0.1
```

If the connection fails, the error stays under the field so you can fix the URL and try again.

---

## Dump

1. Paste the URL
2. Dump **all databases**, or pick from a list
3. If you picked more than one: **separate files** or **one combined file**
4. Watch each database finish

| Mode | File you get |
| --- | --- |
| Separate | `backup_<dbname>_YYYYMMDD_HHMMSS.sql` |
| Combined | `backup_combined_YYYYMMDD_HHMMSS.sql` |

Combined files create missing databases on restore and switch between them with `\connect`. Dumps include `--clean --if-exists`, so restore can replace objects that already exist.

---

## Restore

1. Paste the URL
2. Enter the path to the `.sql` file
3. Choose how to apply it

| Option | Use it when |
| --- | --- |
| **Wipe schemas, then restore** | The target already has tables, or a previous restore failed with “already exists” |
| **Restore as-is** | The databases are empty |

Combined dumps create any missing databases, then load the file.

---

## Cleanup

Empties one database’s `public` schema. The database itself stays.

1. Paste a URL **with** `/dbname`
2. Confirm

This runs:

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
```

---

## Drop databases

Permanently deletes the databases you select.

1. Paste the URL
2. Check the databases to drop
3. Confirm

Active connections are kicked first so the drop can proceed. `postgres` and `template*` are protected and will not appear in the list.

---

## Keyboard

| Key | Action |
| --- | --- |
| ↑ / ↓ | Move |
| Enter | Confirm |
| Space | Toggle a checkbox |
| a | Select all (on lists) |
| Esc | Back |
| Ctrl+C | Quit |

---

## Good to know

- Use a role that can dump, create, and drop, depending on what you plan to do.
- Host-only URLs work for dump and drop. Cleanup needs `/dbname` on the URL.
- Prefer **Wipe schemas, then restore** if restore complains that objects already exist.

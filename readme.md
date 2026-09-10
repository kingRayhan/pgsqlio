# pgsqlio

Interactive CLI for PostgreSQL dump, restore, cleanup, and dropping databases.

```bash
npx pgsqlio
# or
bunx pgsqlio
```

![pgsqlio](./assets/cli.png)

Requires [Bun](https://bun.sh) ≥ 1.3 (recommended) or Node.js ≥ 26.4, plus `pg_dump` and `psql` on your `PATH`.

---

## Quick start

```bash
npx pgsqlio
```

You’ll get a terminal UI with sticky branding and a menu. Use ↑/↓ and Enter. Esc goes back. Ctrl+C quits.

Connection URLs work with or without a database name:

```text
postgresql://user:password@host:5432
postgresql://user:password@host:5432/mydb
postgresql://postgres@127.0.0.1
```

---

## Commands (interactive menu)

There are no subcommands — start `pgsqlio` and pick an action.

### Dump

Backup one or more databases.

1. Enter connection URL
2. **All databases** or **Select databases**
3. If multiple: **Separate files** or **Single file**
4. Watch per-database progress

| Mode     | Output                                |
| -------- | ------------------------------------- |
| Separate | `backup_<dbname>_YYYYMMDD_HHMMSS.sql` |
| Single   | `backup_combined_YYYYMMDD_HHMMSS.sql` |

Combined files create missing databases on restore and switch with `\connect`. Dumps include `--clean --if-exists`.

---

### Restore

Import a `.sql` backup.

1. Enter connection URL
2. Enter path to the `.sql` file
3. Choose how to apply:

| Option                         | When to use                                               |
| ------------------------------ | --------------------------------------------------------- |
| **Wipe schemas, then restore** | Target already has objects / retry after a failed restore |
| **Restore as-is**              | Empty databases                                           |

Combined dumps: missing DBs are created automatically, then the file is loaded.

---

### Cleanup

Empty one database’s `public` schema (keeps the database).

1. Enter URL **including** `/dbname`
2. Confirm

Runs:

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
```

---

### Drop databases

Permanently delete selected databases.

1. Enter connection URL
2. Select databases (checkboxes)
3. Confirm

Active connections are terminated first. `postgres` and `template*` cannot be dropped.

---

## Keyboard

| Key    | Action             |
| ------ | ------------------ |
| ↑ / ↓  | Move               |
| Enter  | Confirm            |
| Space  | Toggle checkbox    |
| a      | Select all (lists) |
| Esc    | Back               |
| Ctrl+C | Quit               |

---

## Notes

- Use a role with rights to dump, create, and drop as needed.
- Prefer **Wipe schemas, then restore** if you see “already exists” errors.
- Host-only URLs (no `/dbname`) are fine for Dump / Drop; Cleanup needs a specific database in the URL.

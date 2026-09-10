# Changelog

## 0.2.0 — 2026-09-11

Connection URLs stay on screen while pgsqlio talks to Postgres, with a larger field and a live spinner instead of a blank wait.

### Features

- Connection URL field is taller, so long `postgresql://…` strings are easier to read and edit.
- Dump, restore, cleanup, and drop databases show a spinner on the URL screen while connecting or fetching the database list.

### Fixes

- A failed connection shows the error under the URL field so you can fix it and retry, instead of flashing a failure and returning to the main menu.

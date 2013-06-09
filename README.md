# Zlogd

Logging server for external apps that communicates over unix sock files.

## Install

```shell
npm install
cp transports.json-dist transports.json
```

## Running

Several process variables can be set to alter the runtime of Zlogd:

* `SOCK_FILE` - Path of the unix socket file (default: `/tmp/zlogd.sock`)
* `WORKERS` - Number of workers to use (default: System number of CPUs)
* `STAT_MONITOR` - Should the stat monitor run? (default: `0`)
* `STAT_PULSE` - How often will the stats aggregate/display? (default: `3000` milliseconds)
* `DELIMITER` - What is the delimiter that separates log messages? (default: `??`)

```shell
npm start
```

### Ex: Start with stat monitor on

```shell
STAT_MONITOR=1 npm start
```

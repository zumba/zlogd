# Zlogd

Logging server for external apps that communicates over unix sock files.

## Install

#### For Typical Usage

```shell
npm install -g zlogd
cp /path/to/your/usr/local/bin/zlogd/transports.json-dist /path/to/your/usr/local/bin/zlogd/transports.json
```

#### For Local Development

```shell
npm install zlogd
cp transports.json-dist transports.json
```

## Configuring

You can configure the transports to ship the logs.

Currently supported transports:

* `file` (see [winston file configuration](https://github.com/flatiron/winston/blob/master/docs/transports.md#file-transport))

```json
{
	"type": "file",
	"config": {
		"filename": "/tmp/out.log" 
	}
}
```

* `logstash` (see [winston-logstash](https://github.com/jaakkos/winston-logstash))

```json
{
	"type": "logstash",
	"config": {
		"host": "127.0.0.1",
		"port": 28777
	}
}
```

## Running

#### Environment Switches

Several process variables can be set to alter the runtime of Zlogd:

* `SOCK_FILE` - Path of the unix socket file (default: `/tmp/zlogd.sock`)
* `WORKERS` - Number of workers to use (default: System number of CPUs)
* `STAT_MONITOR` - Should the stat monitor run? (default: `0`)
* `STAT_PULSE` - How often will the stats aggregate/display? (default: `3000` milliseconds)
* `DELIMITER` - What is the delimiter that separates log messages? (default: `;;`)

#### Command Line Switches

As of `0.2.x`, CLI commands are available that can be used in place of environment variables:

* `-h, --help` - output usage information
* `-V, --version` - output the version number
* `-f, --forground` - Run zlogd in the forground.
* `-w, --workers [number]` - Run zlogd with set number of workers. Defaulting to number of CPUs.
* `-i, --input-socketfile [path]` - Path (/tmp/zlog.sock) to sock file for zlogd to listen.
* `-d, --delimiter [delimiter]` - The delimiter symbol (;;) to indicate to zlogd separate messages per request.
* `-s, --stat-monitor` - Run zlogd with a statmonitor.
* `-p, --stat-pulse [milliseconds]` - Stat monitor pulses at this rate (3000).

Local:

```shell
npm start
```

global:

```shell
zlogd
```

As of version `0.2.0`, running this process will default to running as a daemon. You can view the processes in linux/mac by doing `ps -A | grep -i zlogd`.

## Send a Log Message

Here is an example PHP script sending a log message to zlogd:


```php
<?php

$socket = fsockopen('unix:///tmp/zlog.sock', 0);
$delimiter = ';;';
$packet = json_encode(array(
        'level' => 'debug',
        'message' => 'hello world!'
)) . $delimiter;
fputs($socket, $packet, strlen($packet));
```

## Todo

* Add upstart script for managing processes.
* Prevent duplicate runs (possibly generate a lock file and delete on exit).
* Add formal documentation to a `/docs` directory.

# Zlogd

Logging server for external apps that communicates over unix sock files.

## Install

```shell
npm install zlogd
cp transports.json-dist transports.json
```

Or you can install globally:

```shell
npm install -g zlogd
cp /path/to/your/usr/local/bin/zlogd/transports.json-dist transports.json
```

## Configuring

You can configure the transports to ship the logs.

Currently supported transports:

* `file`

```json
{
	"type": "file",
	"config": {
		"filename": "/tmp/out.log" 
	}
}
```

* `logstash`

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

Several process variables can be set to alter the runtime of Zlogd:

* `SOCK_FILE` - Path of the unix socket file (default: `/tmp/zlogd.sock`)
* `WORKERS` - Number of workers to use (default: System number of CPUs)
* `STAT_MONITOR` - Should the stat monitor run? (default: `0`)
* `STAT_PULSE` - How often will the stats aggregate/display? (default: `3000` milliseconds)
* `DELIMITER` - What is the delimiter that separates log messages? (default: `;;`)

Local:

```shell
npm start
```

global:

```shell
zlogd
```

### Ex: Start with stat monitor on

```shell
STAT_MONITOR=1 zlogd
```

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

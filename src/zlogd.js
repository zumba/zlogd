#!/usr/bin/env node

var cluster = require('cluster'),
	net = require('net'),
	fs = require('fs'),
	winston = require('winston'),
	logstash = require('winston-logstash'),
	async = require('async'),
	command = require('commander'),
	_ = require('underscore');

var config = {};

var statCount = 0,
	worker,
	out = fs.openSync('./out.log', 'a'),
	err = fs.openSync('./out.log', 'a');

var masterApi = {
	mapCommandsToEnv: function(commands) {
		var envConfig = {},
			mapping = {
			'statMonitor': 'STAT_MONITOR',
			'statPulse': 'STAT_PULSE',
			'delimiter': 'DELIMITER',
			'workers': 'WORKERS',
			'inputSocketfile': 'SOCK_FILE'
		};
		var commandValues = _.pick(commands, _.keys(mapping));
		_.each(commandValues, function (val, key) {
			envConfig[mapping[key]] = val;
		});

		return envConfig;
	},
	getConfig: function() {
		return {
			sockfile: process.env.SOCK_FILE || '/tmp/zlog.sock',
			workers: process.env.WORKERS || require('os').cpus().length,
			statMonitor: process.env.STAT_MONITOR || false,
			statPulse: process.env.STAT_PULSE || 3000,
			chunkDelimiter: process.env.DELIMITER || ';;'
		}
	}
}

// Worker API
var workerApi = {
	logChunkContent: function(chunk) {
		var params, content;
		try {
			chunk = chunk.trim();
			if (!chunk) {
				return;
			}
			content = JSON.parse(chunk);
		} catch (error) {
			console.log('Invalid chunk JSON input:', chunk);
			return;
		}
		params = {
			grouper: content.grouper || 'default',
			category: content.category || 'default',
			source: content.source || 'default',
			meta: content.meta || {},
			timestamp: content.timestamp || new Date().getTime(),
		};

		winston.log(
			content.level || 'debug',
			content.message || '',
			params
		);
	}
}

var statApi = {
	lastCount: 0,
	check: function() {
		work = statCount - statApi.lastCount;
		console.log({
			time: new Date().getTime(),
			work: work,
			rate: work / (config.statPulse / 1000)
		});
		statApi.lastCount = statCount;
	}
}

if (cluster.isMaster) {

	process.title = 'zlogd';

	command
		.version('0.2.0')
		.option('-f, --forground', 'Run zlogd in the forground.')
		.option('-w, --workers [number]', 'Run zlogd with set number of workers. Defaulting to number of CPUs.')
		.option('-i, --input-socketfile [path]', 'Path (/tmp/zlog.sock) to sock file for zlogd to listen.', '/tmp/zlog.sock')
		.option('-d, --delimiter [delimiter]', 'The delimiter symbol (;;) to indicate to zlogd separate messages per request.', ';;')
		.option('-s, --stat-monitor', 'Run zlogd with a statmonitor.')
		.option('-p, --stat-pulse [milliseconds]', 'Stat monitor pulses at this rate (3000).', 3000)
		.parse(process.argv);

	process.env = _.extend(process.env, masterApi.mapCommandsToEnv(command));

	// Set off the process as a daemon
	if (!process.env.CHILD_FORKED && !command.forground) {
		var cmd = '',
			args = command.args;
		process.env = _.extend(process.env, {CHILD_FORKED: 1});
		args.unshift(__filename);
		var child = require('child_process').spawn('node', args, {
			env: process.env,
			detached: false,
			stdio: [ 'ignore', out, err ]
		});
		child.unref();
		process.exit(0);
	}

	config = masterApi.getConfig();

	// Remove old socket files
	fs.unlink(config.sockfile, function (error) {
		if (error) {
			console.log('Error removing old sock file', error);
			return;
		}
	});

	console.log('Master process starting.');
	for (var i = config.workers; i > 0; i--) {
		worker = cluster.fork();
		console.log('Worker[' + worker.id + '] started.');
	}

	cluster.on('disconnect', function (worker) {
		console.log('Worker disconnected!');
	});

	cluster.on('exit', function (worker, code, signal) {
		console.error('Worker ' + worker.process.pid + ' died');
		if (worker.suicide) {
			cluster.fork();
		} else {
			if (Object.keys(cluster.workers).length <= 0) {
				console.error('No workers left, ending main process.');
				process.exit(1);
			}
		}
	});

	_.each(cluster.workers, function (worker) {
		// Be a good master and listen to your workers!
		worker.on('message', function(workerMessage) {
			switch (workerMessage.type) {
				case 'complete':
					statCount += workerMessage.data;
					break;
				default:
					console.log('Master does not understand message.');
			}
		});
	});

	// Create the socket listener
	var server = net.createServer(function (socket) {
		var socketData = '', workToBeDone, split;
		socket.setEncoding('utf8');

		// Compile chunks for this request
		socket.on('data', function (data) {
			socketData += data;
		});

		// Delegate the work to the workers
		socket.on('end', function() {
			workToBeDone = socketData.split(config.chunkDelimiter);
			split = Math.ceil(workToBeDone.length / config.workers);
			_.each(cluster.workers, function(worker) {
				worker.send({
					type: 'work',
					data: workToBeDone.slice(0, split)
				});
				workToBeDone.splice(0, split);
			});
			socketData = '';
		});
	});

	// Start the server
	server.listen(config.sockfile, function () {
		fs.chmod(config.sockfile, parseInt('777', 8), function (error) {
			if (error) {
				console.log('Socket permission failed.', error);
			}
		});
		console.log('Master listening to socketfile: ' + config.sockfile);
	});

	// Statistics reporting
	if (config.statMonitor) {
		console.log('Stat monitor enabled. [' + config.statPulse + ']');
		setInterval(statApi.check, config.statPulse);
	} else {
		console.log('Stat monitor disabled.');
	}

} else {

	process.title = 'zlogd-worker';

	config = masterApi.getConfig();

	// Setup winston logging
	var transports = require(__dirname + '/../transports.json'),
		transportType, 
		transportConfig;
	_.each(transports, function (transport) {
		switch (transport.type) {
			case 'file':
				transportType = winston.transports.File;
				transportConfig = transport.config;
				break;
			case 'logstash':
				transportType = winston.transports.Logstash;
				transportConfig = transport.config;
				break;
			default:
				console.log('Unknown transport: ' + transport.type);
		}
		winston.add(transportType, transportConfig);
	});
	winston.remove(winston.transports.Console);

	// Listen to messages from the master
	process.on('message', function(message) {
		// Master told me I have work to do!
		switch (message.type) {
			case 'work':
				async.each(message.data, workerApi.logChunkContent);
				if (config.statMonitor) {
					// Communicate completion statistics to master stat tracker
					process.send({
						type: 'complete',
						data: message.data.length
					});
				}
				break;
			default:
				console.log('Worker does not understand message.');
		}
	});

}

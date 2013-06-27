#!/usr/bin/env node

var cluster = require('cluster'),
	net = require('net'),
	fs = require('fs'),
	winston = require('winston'),
	logstash = require('winston-logstash'),
	async = require('async');

// Process configuration
var config = {
	sockfile: process.env.SOCK_FILE || '/tmp/zlog.sock',
	workers: process.env.WORKERS || require('os').cpus().length,
	statMonitor: process.env.STAT_MONITOR || false,
	statPulse: process.env.STAT_PULSE || 3000,
	chunkDelimiter: process.env.DELIMITER || ';;'
}

var statCount = 0,
	worker,
	out = fs.openSync('./out.log', 'a'),
	err = fs.openSync('./out.log', 'a');

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

	// Set off the process as a daemon
	if (!process.env.CHILD_FORKED) {
		var env = process.env;
		env.CHILD_FORKED = 1;
		var child = require('child_process').spawn('node', [__filename], {
			env: env,
			detached: false,
			stdio: [ 'ignore', out, err ]
		});
		child.unref();
		process.exit(0);
	}

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

	// Be a good master and listen to your workers!
	Object.keys(cluster.workers).forEach(function(id) {
		cluster.workers[id].on('message', function(workerMessage) {
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
			for (var i in cluster.workers) {
				cluster.workers[i].send({
					type: 'work',
					data: workToBeDone.slice(0, split)
				});
				workToBeDone.splice(0, split);
			}
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

	// Setup winston logging
	var transports = require(__dirname + '/../transports.json'),
		transportType, 
		transportConfig;
	for (var i in transports) {
		switch (transports[i].type) {
			case 'file':
				transportType = winston.transports.File;
				transportConfig = transports[i].config;
				break;
			case 'logstash':
				transportType = winston.transports.Logstash;
				transportConfig = transports[i].config;
				break;
			default:
				console.log('Unknown transport: ' + transports[i].type);
		}
		winston.add(transportType, transportConfig);
	}
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

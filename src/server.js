#!/usr/bin/env node

var cluster = require('cluster'),
	net = require('net'),
	fs = require('fs'),
	winston = require('winston'),
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
	worker;

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

	// Setup winston logging
	// @todo implement json require to get winston transports to instantiate
	winston.add(winston.transports.File, { filename: '/tmp/out.log' });
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

#!/usr/bin/env node

var cluster = require('cluster'),
	net = require('net'),
	fs = require('fs'),
	winston = require('winston'),
	async = require('async');

// Config the UNIX socket file
var SOCK_FILE = process.env.SOCK_FILE || '/tmp/zlog.sock';
var WORKERS = process.env.WORKERS || require('os').cpus().length;
var chunkDelimiter = ';';

if (cluster.isMaster) {
	
	fs.unlink(SOCK_FILE, function (error) {
		if (error) {
			console.log('Error removing old sock file', error);
			return;
		}
	});

	console.log('Master process starting.');
	for (var i = WORKERS; i > 0; i--) {
		console.log('Starting worker');
		cluster.fork();
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
			var split, workToBeDone = [];
			// Worker told me I have work to delegate
			if (workerMessage.type === 'received') {
				workToBeDone = workerMessage.data.split(chunkDelimiter);
				split = Math.ceil(workToBeDone.length / WORKERS);
				for (var i in cluster.workers) {
					cluster.workers[i].send({
						type: 'work',
						data: workToBeDone.slice(0, split)
					});
					workToBeDone.splice(0, split);
				}
			}
		});
	});

} else {

	// @todo implement json require to get winston transports to instantiate
	winston.add(winston.transports.File, { filename: '/tmp/out.log' });
	winston.remove(winston.transports.Console);
	var logChunkContent = function(chunk) {
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

	// Create the socket listener
	var server = net.createServer(function (socket) {
		var socketData = '';
		socket.setEncoding('utf8');
		// Compile chunks for this request
		socket.on('data', function (data) {
			socketData += data;
		});
		// Pass the compiled chunk up to the master to delegate
		socket.on('end', function() {
			process.send({
				type: 'received',
				data: socketData
			});
			socketData = '';
		});
	});

	// Listen to messages from the master
	process.on('message', function(message) {
		// Master told me I have work to do!
		if (message.type === 'work') {
			async.each(message.data, logChunkContent);
		}
	});

	// Start the server
	server.listen(SOCK_FILE, function () {
		fs.chmod(SOCK_FILE, parseInt('777', 8), function (error) {
			if (error) {
				console.log('Socket permission failed.', error);
			}
		});
		console.log('Worker listening to socket.');
	});
}

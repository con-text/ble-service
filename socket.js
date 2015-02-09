/**************************************************
 * Front-end socket initialisation
 * Timeout functions to send active peripherals
 **************************************************/

// Modules
var common = require("./common.js");
var bluetooth = require("./bluetooth.js");

// Libraries
var net = require('net');
var fs  = require('fs');

// Simulate data for the front-end
function getMockData() {

	// Some mock users
	var users = [
			{id: '0001' },
			{id: '0002' },
			{id: '0003' },
			{id: '0004' }
	];

	return users;
}

// From http://stackoverflow.com/questions/11935175/sampling-a-random-subset-from-an-array
function getRandomSubarray(arr, size) {
		var shuffled = arr.slice(0), i = arr.length, temp, index;
		while (i--) {
				index = Math.floor((i + 1) * Math.random());
				temp = shuffled[index];
				shuffled[index] = shuffled[i];
				shuffled[i] = temp;
		}
		return shuffled.slice(0, size);
}

function getRandomInt(min, max) {
		return Math.floor(Math.random() * (max - min + 1)) + min;
}

function startService(socketName) {
	server.listen(socketName, function () {
		console.log("Created server at unix socket " + socketName);
	});
}

var server = net.createServer({allowHalfOpen: true}, function(socket) {

	// Check the state of active devices, and reauthenticate if necessary
	setInterval(function(){

		var data = {};

		if(common.useMockData) {

			// Take random array elements
			var allMockUsers = getMockData();

			var users = getRandomSubarray(allMockUsers, getRandomInt(0,
				allMockUsers.length));

			data = {
				clients: users
			};


		} else {

			// Get active users from bluetooth
			data = bluetooth.activePeripheralsToUserData();
		}

		// Write data to the socket
		if(socket.writable) {
			socket.write(JSON.stringify(data))
		} else {
			socket.end();
		}

	}, common.updateInterval);

	socket.on('end', function() {
		console.log('Client disconnected');
	});

	socket.on('error', function(err) {
		console.log("Error occured", err);
	});

	socket.pipe(socket);

	// On Ctrl-C exit
	process.on( 'SIGINT', function() {

		// Close BLE service socket
		socket.end();

		// some other closing procedures go here
		process.exit();
	});

});


// Listen to the front-end socket
var socketName = "/tmp/ble.sock";

fs.exists(socketName, function(exists) {
	if(exists) {
		fs.unlink(socketName, function(err) {
			if(err) throw err;
			startService(socketName);
		});
	} else {
		startService(socketName);
	}
});

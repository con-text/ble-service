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
var JsonSocket = require('json-socket');

// Wearable ID to initiate login sequence with
var loginID = "EA8F2A44";

// Simulate data for the front-end
function getMockData() {

	// Some mock users
	var users = [
			{id: 'EA8F2A44', state: 'active' },
			{id: 'ABC1231', state: 'active' },
			{id: 'tester', state: 'active' },
			{id: 'ABC1232', state: 'stale' }
	];

	return users;
}

// From http://stackoverflow.com/questions/11935175/sampling-a-random-subset-from-an-array
function getRandomSubarray(arr, size) {
		var shuffled = arr.slice(1), i = arr.length-1, temp, index;
		while (i--) {
				index = Math.floor((i + 1) * Math.random());
				temp = shuffled[index];
				shuffled[index] = shuffled[i];
				shuffled[i] = temp;
		}
		var res = [arr[0]].concat(shuffled.slice(0, size));
		console.log(res);
		return res;
}

function getRandomInt(min, max) {
		return Math.floor(Math.random() * (max - min + 1)) + min;
}

function startService(socketName) {
	server.listen(socketName, function () {
		console.log("Created server at unix socket " + socketName);
	});
}

var server = net.createServer({allowHalfOpen: true});

server.on('connection', function(socket) {

	// Decorate with Json Socket
	socket = new JsonSocket(socket);

	// Check the state of active devices, and reauthenticate if necessary
	var intervaHandle = setInterval(function(){

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
		socket.sendMessage(data);

	}, common.updateInterval);

	socket.on('end', function() {
		clearInterval(intervaHandle);
		console.log('Client disconnected');
	});

	socket.on('error', function(err) {
		clearInterval(intervaHandle);
		console.log("Error occured", err);
	});

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

module.exports = {
  loginID: loginID
};

/**************************************************
 * Front-end socket initialisation
 * Timeout functions to send active peripherals
 **************************************************/

// Modules
var common = require("./common.js");
var bluetooth = require("./bluetooth.js");

// Libraries
var net = require('net');

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

var server = net.createServer({allowHalfOpen: true}, function(socket) {

	// Check the state of active devices, and reauthenticate if necessary
	setInterval(function(){

		if(common.useMockData) {

			// Take random array elements
			var allMockUsers = getMockData();

			var users = getRandomSubarray(allMockUsers, getRandomInt(0,
				allMockUsers.length));

			var data = {
				clients: users
			};

			if(socket.writable) socket.write(JSON.stringify(data))
			else socket.end();

		} else {

			if(socket.writable) socket.write(JSON.stringify(bluetooth.activePeripheralsToUserData()))
			else socket.end();

		}
	}, common.updateInterval);

	socket.on('end', function() {
		console.log('Client disconnected');
	});

	socket.on('error', function(err) {
		console.log("Error occured", err);
	});

	socket.pipe(socket);

});


// Listen to the front-end socket
var port = 5001;

server.listen(port, function () {
	console.log("Listening on " + port)
});
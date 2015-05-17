// Libraries
var argv = require('yargs')
					.usage('Usage: $0')
					.describe('p', 'Print out the advertising packets')
					.describe('v', 'Be verbose about BLE events (not the advertising packets)')
					.argv;

var request = require('request');
var keyMirror = require('keymirror');

var useMockData = false;
var updateInterval = 2500;

var messageCodes = keyMirror({activePeripherals: null, loginStatus: null});


// Change parameters for mock data
if (process.argv.length > 2 && process.argv[2] === "--mock") {
	console.log("Using mock data.");
	useMockData = true;
}

if (useMockData) {
	updateInterval = 7000;
}

// Shim for IE8 Date.now
exports.currentDate = function()
{
	if (Date.now) return parseInt(Date.now()/1000);
	else return new Date().getTime();
};

// Debug messages
exports.printBLEMessage = function(message)
{
	//console.log(message);
	if (argv.v === true) {
		console.log(message);
	}
};

exports.useMockData = useMockData;
exports.updateInterval = updateInterval;
exports.messageCodes = messageCodes;

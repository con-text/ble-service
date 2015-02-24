// Libraries
var argv = require('yargs')
					.usage('Usage: $0')
					.describe('p', 'Print out the advertising packets')
					.describe('v', 'Be verbose about BLE events (not the advertising packets)')
					.argv;

var request = require('request');
var keyMirror = require('key-mirror');

var useMockData = false;
var updateInterval = 5000;

var messageCodes = keyMirror({activePeripherals: null, loginStatus: null});


// Change parameters for mock data
if (process.argv.length > 2 && process.argv[2] === "--mock") useMockData = true; 
if (useMockData) updateInterval: 15000;

// Shim for IE8 Date.now
exports.currentDate = function()
{
	if (Date.now) return Date.now();
	else return new Date().getTime();
};

// Debug messages
exports.printBLEMessage = function(message)
{
	if (argv.v == true) console.log(message);
};

exports.useMockData = useMockData;
exports.updateInterval = updateInterval;
exports.messageCodes = messageCodes;
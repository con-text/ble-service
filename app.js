// Libraries
var noble = require('noble');
var net = require('net');
var argv = require('yargs')
					.usage('Usage: $0')
					.describe('p', 'Print out the advertising packets')
					.describe('v', 'Be verbose about BLE events (not the advertising packets)')
					.argv;
// Constants
var userServiceUUID = "2220";
var readCharacteristicUUID = "2221";
var writeCharacteristicUUID = "2222";
var disconnectCharacteristicUUID = "2223";

// Variables
var userKey = "";
var activePeripherals = {};
var needsCheckingQueue = [];
var isScanning = false;
var locked = 0;
var readChannel = null;
var writeChannel = null;

// Shim for IE8 Date.now
if (!Date.now) {
    Date.now = function() { return new Date().getTime(); }
}

// Set up socket
var server = net.createServer({allowHalfOpen: true}, function(socket) { 

	// Check active devices are still around
	setInterval(function(){
	
		console.log("Current active users: " + JSON.stringify(activePeripherals))
		console.log("Current stale users: " + JSON.stringify(needsCheckingQueue))

		if(socket.writable) {
			socket.write(JSON.stringify(activePeripheralsToUserData()))
		} else {
			socket.end();
		}
	
		for (var peripheralKey in activePeripherals) {
	
			if ((activePeripherals[peripheralKey]["lastConnectionTime"] < (Date.now() - 15000)) 
				&& activePeripherals[peripheralKey]["lastConnectionTime"] > (Date.now() - 60000)) {
	
				// Is it already in the queue?
				for (var i = 0; i < needsCheckingQueue.length; i++) {
					if (needsCheckingQueue[i][0] == peripheralKey) return;
				}
	
				needsCheckingQueue.push([peripheralKey, activePeripherals[peripheralKey]])
			} else if (activePeripherals[peripheralKey]["lastConnectionTime"] < (Date.now() - 60000)) {
				console.log("Deleting " + peripheralKey + " at " + Date.now());
				delete activePeripherals[peripheralKey];
				removePeripheralFromChecking(peripheralKey);
			}
	
		}
	
	},5000);

	socket.on('end', function() {
		console.log('client disconnected');
	});
 
	socket.on('error', function(err) {
		console.log("Error occured", err);
	});
	
	socket.pipe(socket);

});

var port = 5001;
 
server.listen(port, function () {
	console.log("Listening on " + port)
});

function activePeripheralsToUserData() {
	data = {};
	data["clients"] = [];

	for (var peripheral in activePeripherals) {
		data["clients"].push({id: peripheral, name: activePeripherals[peripheral]["name"]})
	}

	return data;
}

function doesPeripheralNeedChecking(uuid) {
	for (var i = 0; i < needsCheckingQueue.length; i++) {
		if (needsCheckingQueue[i][0] == uuid) return 1;
	}

	return 0;
}

function removePeripheralFromChecking(uuid) {
	for (var i = 0; i < needsCheckingQueue.length; i++) {
		if (needsCheckingQueue[i][0] == uuid) needsCheckingQueue.splice(i, 1);
	}
}

function startScanning() {
	if (isScanning == false) {
		var serviceUUIDs = [userServiceUUID]; // default: [] => all
		var allowDuplicates = true; // default: false

		noble.startScanning(serviceUUIDs, allowDuplicates); // particular UUID's

		isScanning = true;
	}
}

function stopScanning() {
	if (isScanning == true) {
		noble.stopScanning();

		isScanning = false;
	}
}

function printBLEMessage(message)
{
	if (argv.v == true) {
		console.log(message);
	}
}

noble.on('stateChange', function(state) {
	printBLEMessage('on -> stateChange: ' + state);

	if (state === 'poweredOn') 
		startScanning();
	else 
		stopScanning();

});

noble.on('scanStart', function() {
	printBLEMessage('on -> scanStart');
});

noble.on('scanStop', function() {
	printBLEMessage('on -> scanStop');
});

var onServiceDiscoveredCallback = function(services) {
	for (var serviceID in services) {
		service = services[serviceID];
		if (service["uuid"] === userServiceUUID) {
			service.on('characteristicsDiscover', function(characteristics) {
				for (var characteristicID in characteristics) {
					characteristic = characteristics[characteristicID];
					if (characteristic["uuid"] === readCharacteristicUUID) {
					/*	characteristic.on('write', function() {
							printBLEMessage('on -> characteristic write ');
						});
						
						var nonceString = makeNonce();
						var nonceValue = new Buffer(nonceString, "utf-8");

						console.log("Sending Nonce " + nonceString);

						characteristic.write(nonceValue, function(err) {
							if (err) {
								printBLEMessage("Error writing value " + err);
							}
						});*/
						readChannel = characteristic;
						readChannel.on('read', function(data, isNotification) {
							console.log(data);
						});
					} else if (characteristic["uuid"] === writeCharacteristicUUID) {
					/*	characteristic.notify(true, function(err) {
							if (err) {
								printBLEMessage("Error subscribing to notification " + err);
							}
						});

						characteristic.on('notify', function(state) {
							printBLEMessage('on -> characteristic notify ' + state);
							userKey = "";
						});

						characteristic.on('read', function(data, isNotification) {
							if (data.toString('hex') == "04") {
								console.log("Final user key: " + userKey);
								locked = 0;
								peripheral.disconnect();
							} else {
								userKey += data;
							}
						});		*/
						writeChannel = characteristic;
					}
				}
			});
		service.discoverCharacteristics();
		}
	}
};

var onDeviceDiscoveredCallback = function(peripheral) {
	if (argv.p == true) 
		console.log('on -> discover: ' + peripheral);

	if (locked != 0) {
		return;
	} else {
		locked = 1;
	}

	// Only connect to a peripheral if it's not in activePeripherals or if it's in needsCheckingQueue 
	if ((activePeripherals[peripheral["uuid"]] == undefined) || doesPeripheralNeedChecking(peripheral["uuid"])) {
	
		peripheral.once('connect', function() {
			printBLEMessage('on -> connect');
			this.discoverServices();
		});

		peripheral.once('disconnect', function() {
			// Reset the channels
			readChannel = null;
			writeChannel = null;

			printBLEMessage("Disconnected....Starting to scan again")
			startScanning();
		});

		peripheral.once('rssiUpdate', function(rssi) {
			printBLEMessage('on -> RSSI update ' + rssi);
		});

		peripheral.once('servicesDiscover', onServiceDiscoveredCallback);

		stopScanning();

		console.log("Found user with UUID: " + getUserUUID(peripheral));

		peripheral.connect(function(err) {
			if (err) {
				console.log(err);
			}
		});
	} else {
		locked = 0;
		startScanning();
	}

};

noble.on('discover', onDeviceDiscoveredCallback);

// http://stackoverflow.com/questions/1349404/generate-a-string-of-5-random-characters-in-javascript
function makeNonce()
{
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for( var i=0; i < 5; i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}

function getUserUUID(peripheral) 
{
	return peripheral.advertisement.manufacturerData.slice(2).toString();
}
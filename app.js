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

var readString = "";

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

var onCharacteristicsDiscoveredCallback = function(characteristics) {
	for (var characteristicID in characteristics) {
		characteristic = characteristics[characteristicID];
		if (characteristic["uuid"] === readCharacteristicUUID) {			
			readChannel = characteristic;
			readChannel.notify(true);
			readChannel.on('read', onReadMessage);
		} else if (characteristic["uuid"] === writeCharacteristicUUID) {
			writeChannel = characteristic;
		//	writeChannel.write(new Buffer("LOL", "utf-8"));
			//sendMessage("9AD6368489A9A856D0E454641521DA3F56F5F9E9CAEF7AF60E84ABD1F1901F059AD6368489A9A856D0E454641521DA3F56F5F9E9CAEF7AF60E84ABD1F1901F059AD6368489A9A856D0E454641521DA3F56F5F9E9CAEF7AF60E84ABD1F1901F059AD6368489A9A856D0E454641521DA3F56F5F9E9CAEF7AF60E84ABD1F1901F05");
		}
	}
};

var onServiceDiscoveredCallback = function(services) {
	for (var serviceID in services) {
		service = services[serviceID];
		if (service["uuid"] === userServiceUUID) {
			service.on('characteristicsDiscover', onCharacteristicsDiscoveredCallback);
			
			// Discover the characteristics
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

    for(var i = 0; i < 5; i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}

function getUserUUID(peripheral) 
{
	return peripheral.advertisement.manufacturerData.slice(2).toString();
}

function sendMessage(message) {
	if (writeChannel != null) {
		// Send the first packet
		var currentSubMessage = "1";
		currentSubMessage += message.substr(0, 19);
		rawWrite(currentSubMessage);

		// Get the message length
		var messagesToSend = Math.ceil(message.length / 19.0);

		for (var i = 1; i < messagesToSend; i++) {
			// Create the data packet
			currentSubMessage = "2";
			currentSubMessage += message.substr(i * 19, 19);
			rawWrite(currentSubMessage);
		}

		// Send EOM
		currentSubMessage = "3";
		rawWrite(currentSubMessage);
	}
}

function rawWrite(message) {
	if (writeChannel != null) {
		var bufferString = new Buffer(message, "utf-8");
		writeChannel.write(bufferString);
		console.log("Sending message: " + message);
	}
}

function readMessage(message) {
	console.log(message);
	if (message == "9AD6368489A9A856D0E454641521DA3F56F5F9E9CAEF7AF60E84ABD1F1901F059AD6368489A9A856D0E454641521DA3F56F5F9E9CAEF7AF60E84ABD1F1901F059AD6368489A9A856D0E454641521DA3F56F5F9E9CAEF7AF60E84ABD1F1901F059AD6368489A9A856D0E454641521DA3F56F5F9E9CAEF7AF60E84ABD1F1901F05") {
		console.log("SUCCESS!");
	}
}

var onReadMessage = function rawReadMessage(data, isNotification) {

	var dataString = data.toString();

	if(dataString[0] == '1') {
		readString = "";
		for (var i = 1; i < dataString.length; i++) {
			readString += dataString[i];
		}
	}

	if(dataString[0] == '2') {
		for (var i = 1; i < dataString.length; i++) {
			readString += dataString[i];
		}
	}

	if(dataString[0] == '3') {
		if (readString != "") readMessage(readString);
	}

};
/**************************************************
 * Bluetooth functions and event callbacks
 **************************************************/

// Modules
var common = require("./common.js");
var handshake = require("./handshake.js");

// Libraries
var noble = require('noble');

// Constants
var userServiceUUID = "2220";
var readCharacteristicUUID = "2221";
var writeCharacteristicUUID = "2222";
var disconnectCharacteristicUUID = "2223";

// Variables
var activePeripherals = {};
var needsCheckingQueue = [];
var isScanning = false;
var locked = 0;
var readChannel = null;
var writeChannel = null;
var disconnectChannel = null;
var readString = "";

noble.on('stateChange', function(state) {
	common.printBLEMessage('on -> stateChange: ' + state);
	if (state === 'poweredOn') startScanning();
	else stopScanning();
});

noble.on('scanStart', function() {
	common.printBLEMessage('on -> scanStart');
});

noble.on('scanStop', function() {
	common.printBLEMessage('on -> scanStop');
});

function startScanning() {
	if (isScanning == false) {
		var serviceUUIDs = [userServiceUUID]; // default: [] => all
		var allowDuplicates = true;

		noble.startScanning(serviceUUIDs, allowDuplicates);

		isScanning = true;
	}
}

function stopScanning() {
	if (isScanning == true) {
		noble.stopScanning();
		isScanning = false;
	}
}

function disconnectFromDevice(peripheral) {
	if (disconnectChannel != null) {
		console.log("Sending Disconnect");
		disconnectChannel.write(new Buffer("", "utf-8"));
		peripheral.disconnect();
	}
}

function activePeripheralsToUserData() {
	data = {};
	data["clients"] = [];

	for (var peripheral in activePeripherals) {
		data["clients"].push({id: peripheral, state: activePeripherals[peripheral]["state"]})
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

var onCharacteristicsDiscoveredCallback = function(characteristics) {
	for (var characteristicID in characteristics) {
		characteristic = characteristics[characteristicID];
		if (characteristic["uuid"] === readCharacteristicUUID) {
			readChannel = characteristic;
			readChannel.notify(true);
			readChannel.on('read', onReadMessage);
		} else if (characteristic["uuid"] === writeCharacteristicUUID) {
			writeChannel = characteristic;
		} else if (characteristic["uuid"] === disconnectCharacteristicUUID) {
			disconnectChannel = characteristic;
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

	common.printBLEMessage('on -> discover: ' + peripheral);

	if (locked != 0) return;
	else locked = 1;

	// Only connect to a peripheral if it's not in activePeripherals or if it's in needsCheckingQueue
	if ((activePeripherals[getUserUUID(peripheral)] == undefined) || doesPeripheralNeedChecking(getUserUUID(peripheral))) {

		peripheral.once('connect', function() {
			common.printBLEMessage('on -> connect');
			this.discoverServices();
		});

		peripheral.once('disconnect', function() {
			// Reset the channels
			readChannel = null;
			writeChannel = null;
			disconnectChannel = null;

			common.printBLEMessage("Disconnected....Starting to scan again")
			handshake.handshakeSM.reset();
			locked = 0;
			startScanning();
		});

		peripheral.once('rssiUpdate', function(rssi) {
			common.printBLEMessage('on -> RSSI update ' + rssi);
		});

		peripheral.once('servicesDiscover', onServiceDiscoveredCallback);

		stopScanning();

		console.log("Found user with UUID: " + getUserUUID(peripheral));

		peripheral.connect(function(err) {
			if (err) console.log(err);
			else handshake.handshakeSM.connectedToWearable(peripheral, getUserUUID(peripheral));
		});
	} else {
		locked = 0;
		startScanning();
	}

};

noble.on('discover', onDeviceDiscoveredCallback);

function getUserUUID(peripheral)
{
	return peripheral.advertisement.manufacturerData.slice(2).toString();
}

// Write a message to the peripheral
// Divided into several chunks and batch sent
function writeMessage(message) {

	message = message.toUpperCase();

	if (writeChannel != null) {

		// Send the first packet
		var currentSubMessage = "1";
		currentSubMessage += message.substr(0, 19);
		rawWriteMessage(currentSubMessage);

		// Get the message length
		var messagesToSend = Math.ceil(message.length / 19.0);

		for (var i = 1; i < messagesToSend; i++) {
			// Create the next data packet
			currentSubMessage = "2";
			currentSubMessage += message.substr(i * 19, 19);
			rawWriteMessage(currentSubMessage);
		}

		// Send EOM
		currentSubMessage = "3";
		rawWriteMessage(currentSubMessage);
	}
}

function readMessage(message) {
	handshake.handshakeSM.receiveDataFromWearable(message);
}

function rawWriteMessage(message) {
	if (writeChannel != null) {
		var bufferString = new Buffer(message, "utf-8");
		writeChannel.write(bufferString);
		common.printBLEMessage("Sending message: " + message);
	}
}

var onReadMessage = function rawReadMessage(data, isNotification) {

	var dataString = data.toString();

	// Read the first packet
	if(dataString[0] == '1') {
		readString = "";
		for (var i = 1; i < dataString.length; i++) {
			readString += dataString[i];
		}
	}

	// Read the next data packet
	if(dataString[0] == '2') {
		for (var i = 1; i < dataString.length; i++) {
			readString += dataString[i];
		}
	}

	// Read EOM
	if(dataString[0] == '3') {
		if (readString != "") readMessage(readString);
	}

};

exports.disconnectFromDevice = disconnectFromDevice;
exports.activePeripheralsToUserData = activePeripheralsToUserData;
exports.removePeripheralFromChecking = removePeripheralFromChecking;
exports.writeMessage = writeMessage;
exports.activePeripherals = activePeripherals;
exports.needsCheckingQueue = needsCheckingQueue;
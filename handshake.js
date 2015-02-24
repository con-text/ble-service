/**************************************************
 * Handshaking state machine
 * Authenticates the wearable and vice versa
 **************************************************/

// Modules
var common = require("./common.js");
var bluetooth = require("./bluetooth.js");
var socket = require("./socket.js");

// Libraries
var machina = require('machina');
var crypto = require('crypto');
var request = require('request');
var colors = require('colors');

var handshakeSM = new machina.Fsm( {

	initialize: function( options ) {},

	namespace: "handshakeSM",
	initialState: "uninitialized",
	peripheral: "",
	wearableID: "",
	wearableData: "",
	ourBlock: "",
	encryptedBlockFromOracle: "",
	encryptedBlockFromWearable: "",
	purpose: "",

	states: {
		uninitialized: {
			"*": function() {
				this.deferUntilTransition();
				this.transition( "discovery" );
			}
		},
		discovery: {

			// In discovery state, find devices to connect to

			_onEnter: function() {
				console.log("---In discovery state");
			},

			_reset: "discovery",

			connectedToWearable: function(peripheral, uuid) {

				// Receive a plaintext block from the wearable
				console.log("---Changing to connected state with " + uuid);
				this.peripheral = peripheral;
				this.wearableID = uuid;
				this.transition( "connected" );
			}
		},
		connected: {

			_onEnter: function() {
				console.log("---In connected state with " + this.wearableID);

				this.timer = setTimeout( function() {
					this.handle( "timeout" );
				}.bind( this ), 5000 );
			},

			_reset: "discovery",
			timeout: "unsuccessfulHandshake",

			writeChannelFound: function() {

				// Transition when write channel obtained
				console.log("---Found write channel");
				this.transition( "writeChannelFound" );

			},

			_onExit: function() {
				clearTimeout( this.timer );
			}
		},
		writeChannelFound: {

			// In connected state, inform wearable if login or heartbeat
			// Then await a block from wearable to begin handshaking
			// If we don't receive any data from the wearable after some time
			// we should timeout and return back to discovery mode

			_onEnter: function() {
				console.log("---In writeChannelFound state with " + this.wearableID);

				if (socket.getLoginId() === this.wearableID) {
					this.purpose = "login";
					console.log("---Sending login");
					bluetooth.writeMessage("login");
		  			socket.resetLoginId();
				} else {
					this.purpose = "heartbeat";
					console.log("---Sending heartbeat");
					bluetooth.writeMessage("heartbeat");
				}

				this.timer = setTimeout( function() {
					this.handle( "timeout" );
				}.bind( this ), 5000 );
			},

			_reset: "discovery",
			timeout: "unsuccessfulHandshake",

			receiveDataFromWearable: function(block) {

				// Receive a plaintext block from the wearable
				console.log("---Received plaintext block from wearable:");
				console.log(block);
				this.wearableData = block;
				this.transition( "encryptBlockViaOracle" );

			},

			_onExit: function() {
				clearTimeout( this.timer );
			}
		},
		encryptBlockViaOracle: {

			// Send uuid + wearable's random block to Oracle
			// Recieve back an encrypted block

			_onEnter: function() {
				console.log("---In encryptBlockViaOracle State");
				encryptBlock(this.wearableID, this.wearableData);
				this.timer = setTimeout( function() {
					this.handle( "timeout" );
				}.bind( this ), 7000 );
			},

			_reset: "discovery",
			timeout: "unsuccessfulHandshake",

			receiveEncryptedBlockFromOracle: function(block) {

				// Receive an encrypted block and mac back from Oracle
				console.log("---Received encrypted block from oracle:");
				console.log(block);
				this.encryptedBlockFromOracle = block;
				this.transition( "sendCiphertextToWearable" );

			},

			_onExit: function() {
				clearTimeout( this.timer );
			}
		},
		sendCiphertextToWearable: {

			// Send Oracle-encrypted block to wearable for approval

			_onEnter: function() {
				console.log("---In sendCiphertextToWearable State");

				console.log("---Sending ciphertext to the wearable:");
				console.log(this.encryptedBlockFromOracle);
				bluetooth.writeMessage(this.encryptedBlockFromOracle)

				this.timer = setTimeout( function() {
					this.handle( "timeout" );
				}.bind( this ), 5000 );
			},

			_reset: "discovery",
			timeout: "unsuccessfulHandshake",

			receiveDataFromWearable: function(status) {

				// Receive the wearable's status
				// i.e. whether our encryption was accepted

				console.log("---Received status from wearable.");
				console.log(status);
				if (status == "OK") this.transition( "sendRandomBlockToWearable" );
				else this.transition( "unsuccessfulHandshake" );
			},

			_onExit: function() {
				clearTimeout( this.timer );
			}
		},
		sendRandomBlockToWearable: {

			// Generate our own random block
			// Send our block to wearable

			_onEnter: function() {
				console.log("---In sendRandomBlockToWearable State");

				// Generate 128-bit random binary data
				console.log("---Sending random block to the wearable:");
				this.ourBlock = crypto.randomBytes(16).toString('hex').toUpperCase();
				console.log(this.ourBlock.toString('hex'));
				bluetooth.writeMessage(this.ourBlock.toString('hex'));

				this.timer = setTimeout( function() {
					this.handle( "timeout" );
				}.bind( this ), 5000 );
			},

			_reset: "discovery",
			timeout: "unsuccessfulHandshake",

			receiveDataFromWearable: function(encryptedBlock) {

				// Receive the wearable's encrypted version of our block
				// Need to decrypt it for comparison
				// Might contain an error if we weren't authenticated by them succesfully

				console.log("---Received encrypted block from wearable.");
				console.log(encryptedBlock);
				this.encryptedBlockFromWearable = encryptedBlock;
				this.transition( "decryptBlockViaOracle" );
			},

			_onExit: function() {
				clearTimeout( this.timer );
			}
		},
		decryptBlockViaOracle: {

			// Send uuid + encrypted block from wearable to Oracle for decryption
			// With the result, check it matches our block

			_onEnter: function() {
				console.log("---In decryptBlockViaOracle State");
				decryptBlock(this.wearableID, this.encryptedBlockFromWearable);

				this.timer = setTimeout( function() {
					this.handle( "timeout" );
				}.bind( this ), 7000 );
			},

			_reset: "discovery",
			timeout: "unsuccessfulHandshake",

			receiveDecryptedBlockFromOracle: function(decryptedBlock) {

				// Receive a decrypted block back from Oracle
				console.log("---Received decrypted block from oracle.");
				console.log(decryptedBlock);

				if (decryptedBlock == this.ourBlock.toString('hex')) {
					this.transition( "successfulHandshake" );
				} else {
					this.transition( "unsuccessfulHandshake" );
				}

			},

			_onExit: function() {
				clearTimeout( this.timer );
			}
		},
		successfulHandshake: {

			// Authentication was successful on both ends

			_onEnter: function() {
				console.log("---In successfulHandshake State".bold.green);
				var peripheralData = {
					state: "active",
					lastConnectionTime: Date.now()
				}

				// Inform the front-end that the login was successful
				if (this.purpose === "login") {
					socket.sendMessage(common.messageCodes.loginStatus, {
						result: "success",
						userId: this.wearableID
					});
				}

				bluetooth.activePeripherals[this.wearableID] = peripheralData;
				bluetooth.removePeripheralFromChecking(this.wearableID);
				console.log(JSON.stringify(bluetooth))
				bluetooth.disconnectFromDevice(this.peripheral);
			},
			_reset: "discovery",
			_onExit: function() {
			}
		},
		unsuccessfulHandshake: {

			// Authentication failed

			_onEnter: function() {
				console.log("---In unsuccessfulHandshake State".bold.red);
				console.log(JSON.stringify(bluetooth))

				// Inform the front-end that the login failed
				if (this.purpose === "login") {
					socket.sendMessage(common.messageCodes.loginStatus, {
							result: "fail",
							userId: this.wearableID
					});
				}

				// Trigger a disconnection from the device
				bluetooth.disconnectFromDevice(this.peripheral);

			},
			_reset: "discovery",
			_onExit: function() {
			}
		}
	},

	reset: function() {
		console.log("---Resetting state machine".bold.cyan)
		this.wearableID = "";
		this.wearableData = "";
		this.ourBlock = "";
		this.encryptedBlockFromOracle = "";
		this.encryptedBlockFromWearable = "";
		this.purpose = "";
		this.handle( "_reset" );
	},

	connectedToWearable: function(peripheral, uuid) {
		this.handle( "connectedToWearable", peripheral, uuid );
	},

	writeChannelFound: function() {
		this.handle( "writeChannelFound");
	},

	receiveDataFromWearable: function(block) {
		this.handle("receiveDataFromWearable", block );
	},

	receiveEncryptedBlockFromOracle: function(block) {
		this.handle( "receiveEncryptedBlockFromOracle", block );
	},

	receiveDecryptedBlockFromOracle: function(block) {
		this.handle( "receiveDecryptedBlockFromOracle", block );
	},

} );

// Encrypt a block using the Oracle, receive back Ciphertext + MAC
function encryptBlock(uuid, plaintext) {
	request('http://contexte.herokuapp.com/auth/stage1/' + uuid + '/' + plaintext, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			handshakeSM.receiveEncryptedBlockFromOracle(JSON.parse(body)["message"]);
		}
	});
}

// Decrypt a block using the Oracle, receive back Plaintext
function decryptBlock(uuid, ciphertext) {
	request('http://contexte.herokuapp.com/auth/stage2/' + uuid + '/' + ciphertext, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			handshakeSM.receiveDecryptedBlockFromOracle(JSON.parse(body)["message"]);
		}
	});
}

module.exports = {
  handshakeSM: handshakeSM
};

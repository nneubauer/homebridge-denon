const request = require('request');
const parseString = require('xml2js').parseString;

/* Include lib */
const discover = require('./lib/discover');

const pluginName = 'hombridge-denon-heos';
const platformName = 'DenonAVR';

const infoRetDelay = 250;
const defaultTrace = true;
const autoDiscoverTime = 3000;
/* Setup settings button and info button */
const infoMenu = 'MNINF';
const settingsMenu = 'MNMEN ON';

let Service;
let Characteristic;
let Accessory;
let UUIDGen;

var traceOn

var discoverDev;

var foundReceivers = [];
var cachedAccessories = [];

var didFinishLaunching = false;

module.exports = homebridge => {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	Accessory = homebridge.platformAccessory;
	UUIDGen = homebridge.hap.uuid;

	homebridge.registerPlatform(pluginName, platformName, denonClient, true);
};

class denonClient {
	constructor(log, config, api) {
		this.log = log;
		this.port = 3000;
		this.api = api;

		this.api.on('didFinishLaunching', function() {
			this.log("DidFinishLaunching");
			didFinishLaunching = true;
		}.bind(this));

		traceOn = config.debugTrace || defaultTrace;

		/* Search for all available Denon receivers */
		discoverDev = new discover(this, this.log, foundReceivers, autoDiscoverTime);
		
		this.configReceivers = [];

		for (let i in config.switches) {
			if (!this.configReceivers[config.switches[i].ip])
				this.configReceivers[config.switches[i].ip] = new receiver(this, config, config.switches[i].ip);
		}
		for (let i in config.devices) {
			if (!this.configReceivers[config.devices[i].ip])
				this.configReceivers[config.devices[i].ip] = new receiver(this, config, config.devices[i].ip);
		}

		setTimeout(this.removeCachedAccessory.bind(this), autoDiscoverTime+500);
	}

	configureAccessory(platformAccessory){
		if (traceOn)
			this.log.debug('configureAccessory');

		platformAccessory.reachable = true;
		cachedAccessories.push(platformAccessory);
	}
	removeAccessory(platformAccessory){
		if (traceOn)
			this.log.debug('removeAccessory');

		this.api.unregisterPlatformAccessories(pluginName, platformName, [platformAccessory]);
	}
	removeCachedAccessory(){
		if (traceOn)
			this.log.debug('removeCachedAccessory');

		this.api.unregisterPlatformAccessories(pluginName, platformName, cachedAccessories);
	}
}

class receiver {
	constructor(base, config, ip) {
		this.log = base.log;
		this.port = 3000;
		this.api = base.api;
		this.ip = ip;
		this.base = base;

		this.tvAccessories = [];
		this.legacyAccessories = [];

		this.switches = config.switches;
		this.devices = config.devices;

		this.log.debug('Start receiver with ip: %s', this.ip);

		this.pollingInterval = config.pollInterval || 3;
		this.pollingInterval = this.pollingInterval * 1000;

		this.devInfoSet = false;

		this.manufacturer = 'Denon';
		this.modelName = 'homebridge-denon-heos';
		this.serialNumber = 'MVV123';
		this.firmwareRevision = '2.1.0';

		this.pollingTimeout = false;

		this.usesManualPort = false;

		this.webAPIPort = null;

		this.disableReceiver = false;
		

		this.checkAliveInterval = null;

		this.getPortSettings();

		this.startConfiguration();
	}

	getDevInfoSet() {
		return this.devInfoSet;
	}

	setDevInfoSet(set) {
		this.devInfoSet = set;
	}

	returnIP() {
		return this.ip;
	}

	returnPort() {
		return this.webAPIPort;
	}

	hasManualPort() {
		return this.usesManualPort;
	}

	setDisableReceiver(set) {
		this.disableReceiver = set;
	}

	getPortSettings() {
		/* Configure devices */
		for (var i in this.switches) {
			if (this.switches[i].ip === this.ip) {

				if (this.webAPIPort === null || this.webAPIPort === 'auto') {
					this.webAPIPort = this.switches[i].port || 'auto';
					if(this.webAPIPort != 'auto') 
						this.webAPIPort = this.webAPIPort.toString();
				} else {
					let temp = this.switches[i].port || 'auto';
					if(temp != 'auto') {
						temp = temp.toString();
						if (temp != this.webAPIPort) {
							this.log.error('ERROR: Some manual port number are not equal in config file with receiver: %s', this.ip)
							process.exit(22);
						}
					}
				}
			}
		}

		for (let i in this.devices) {
			if (this.devices[i].ip === this.ip) {
				if (this.webAPIPort === null || this.webAPIPort === 'auto') {
					this.webAPIPort = this.devices[i].port || 'auto';
					if(this.webAPIPort != 'auto') 
						this.webAPIPort = this.webAPIPort.toString();
				} else {
					let temp = this.devices[i].port || 'auto';
					if(temp != 'auto') {
						temp = temp.toString();
						if (temp != this.webAPIPort) {
							this.log.error('ERROR: Some manual port number are not equal in config file with receiver: %s', this.ip)
							process.exit(22);
						}
					}
				}
			}	
		}

		if(this.webAPIPort != 'auto') {
			this.usesManualPort = true;
			if(!this.webAPIPort.includes('80')) {
				this.log.error('ERROR: Current port %s with ip: %s, is not suitable. Use 80 or 8080 manually instead.', this.webAPIPort, this.ip);
				process.exit(22);
			}
			this.log.debug('Manual port %s set: %s', this.webAPIPort, this.ip);
		}
	}

	/* 
	 * Try configure the devices. Wait until receiver discovery is finished.
	 */
	startConfiguration () {
		if (this.disableReceiver)
			return;

		if (!discoverDev.setDenonInformation(this, this.log) || !didFinishLaunching) {
			setTimeout(this.startConfiguration.bind(this), infoRetDelay);
			return;
		}

		/* Configure devices */
		for (var i in this.switches) {
			if (this.switches[i].ip === this.ip)
				this.legacyAccessories.push(new legacyClient(this, this.switches[i]));
		}

		for (let i in this.devices) {
			if (this.devices[i].ip === this.ip)
				this.tvAccessories.push(new tvClient(this, this.devices[i]));
		}
			
		/* start the polling */
		setTimeout(this.startPolling, Math.random() * 3000, this);
	}

	/*
	 * Used to update the state of all. Disable polling for one poll.
	 */
	updateReceiverState(that, stateInfo, curName) {
		if (curName)
			that.pollingTimeout = true;

		for (let i in that.legacyAccessories) {
			if (that.legacyAccessories[i].getName() != curName) {
				that.legacyAccessories[i].setReceiverState(stateInfo);
			}
		}

		for (let i in that.tvAccessories) {
			if (that.tvAccessories[i].getName() != curName) {
				that.tvAccessories[i].setReceiverState(stateInfo);
			}
		}
	}

	/*
	 * Diverted start of polling loop.
	 */
	startPolling (that) {
		if (!that.checkAliveInterval) {
			that.checkAliveInterval = setInterval(that.pollForUpdates.bind(that), that.pollingInterval);
		}
	}

	/*
	 * This will start a polling loop that goes on forever and updates
	 * the on characteristic periodically.
	 */
	pollForUpdates() {
		if (traceOn)
			this.log.debug('pollForUpdates: %s', this.ip);

		/* Make sure that no poll is happening just after switch in input/power */
		if (this.pollingTimeout) {
			this.pollingTimeout = false;
			return;
		}

		var that = this;
		request('http://' + that.ip + ':' + this.webAPIPort + '/goform/formMainZone_MainZoneXmlStatusLite.xml', function(error, response, body) {
			if(error) {
				that.log.error("ERROR: Can't connect to receiver with ip: %s and port: %s", that.ip, that.webAPIPort);
				that.log.debug(error);
				that.connected = false;
			} else if (body.indexOf('Error 403: Forbidden') === 0) {
				that.log.error('ERROR: Can not access receiver with IP: %s. Might be due to a wrong port. Try 80 or 8080 manually in config file.', that.ip);
			} else {
				parseString(body, function (err, result) {
					if(err) {
						that.log.debug("Error while parsing pollForUpdates. %s", err);
					}
					else {	
						// that.log.debug("Got power state to be %s", result.item.Power[0].value[0]);
						// that.log.debug("Got input state to be %s", result.item.InputFuncSelect[0].value[0]);

						let stateInfo = {
							power: result.item.Power[0].value[0],
							inputID: result.item.InputFuncSelect[0].value[0],
							masterVol: result.item.MasterVolume[0].value[0],
							mute: result.item.Mute[0].value[0]
						}
						if (that.volDisp === null)
							that.volDisp = result.item.VolumeDisplay[0].value[0]; 

						if (!that.pollingTimeout)
							that.updateReceiverState(that, stateInfo, null);
					}
				});
			}
		});
	}
}

class tvClient {
	constructor(recv, device) {
		this.log = recv.log;
		this.port = 3000;
		this.api = recv.api;
		this.recv = recv;

		this.webAPIPort = recv.webAPIPort;
		this.devInfoSet = false;

		this.manufacturer = recv.manufacturer;
		this.modelName = recv.modelName;
		this.serialNumber = recv.serialNumber;
		this.firmwareRevision = recv.firmwareRevision;

		this.volDisp = null;

		// configuration
		this.name = device.name || 'Denon Receiver';
		this.ip = device.ip;
		this.inputs = device.inputs;
		
		// this.volumeControl = device.volumeControlBulb;
		// if (this.volumeControl === undefined) {
		// 	this.volumeControl = false;
		// }
		// this.volumeLimit = device.volumeLimit;
		// if (this.volumeLimit === undefined || isNaN(this.volumeLimit) || this.volumeLimit < 0) {
		// 	this.volumeLimit = 100;
		// }


		this.switchInfoMenu = device.switchInfoMenu;
		if (this.switchInfoMenu === true) {
			this.infoButton = settingsMenu;
			this.menuButton = infoMenu;
		} else {
			this.infoButton = infoMenu;
			this.menuButton = settingsMenu;
		}

		/* setup variables */
		this.connected = false;
		this.inputIDSet = false;
		this.inputIDs = new Array();
		
		/* Delay to wait for retrieve device info */
		this.setupTvService();
	}


	/*****************************************
	 * Start of TV integration service 
	 ****************************************/
	setupTvService() {
		if (traceOn)
			this.log.debug('setupTvService: %s', this.name);

		if (!discoverDev.setDenonInformation(this, this.log)) {
			setTimeout(this.setupTvService.bind(this), infoRetDelay);
			return;
		}

		this.tvAccesory = new Accessory(this.name, UUIDGen.generate(this.ip + this.name));

		this.tvService = new Service.Television(this.name, 'tvService');
		this.tvService
			.setCharacteristic(Characteristic.ConfiguredName, this.name);
		this.tvService
			.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);
		this.tvService
			.getCharacteristic(Characteristic.Active)
			.on('get', this.getPowerState.bind(this))
			.on('set', this.setPowerState.bind(this));
		this.tvService
			.getCharacteristic(Characteristic.ActiveIdentifier)
			.on('set', (inputIdentifier, callback) => {
				this.setAppSwitchState(true, callback, this.inputIDs[inputIdentifier]);
			})
			.on('get', this.getAppSwitchState.bind(this));
		this.tvService
			.getCharacteristic(Characteristic.RemoteKey)
			.on('set', this.remoteKeyPress.bind(this));
		this.tvService
			.getCharacteristic(Characteristic.PowerModeSelection)
			.on('set', (newValue, callback) => {
				if (this.connected) {

					request('http://' + this.ip + ':' + this.webAPIPort + '/goform/formiPhoneAppDirect.xml?' + this.menuButton, function(error, response, body) {});
				} 
				callback();
			});

		
		this.tvAccesory
			.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.modelName)
			.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

		this.tvAccesory.addService(this.tvService);

		this.setupTvSpeakerService();
		this.setupInputSourcesService();


		this.log.debug('publishExternalAccessories: %s', this.name);
		this.api.publishExternalAccessories(pluginName, [this.tvAccesory]);
	}

	setupTvSpeakerService() {
		if (traceOn)
			this.log.debug('setupTvSpeakerService: %s', this.name);
		this.tvSpeakerService = new Service.TelevisionSpeaker(this.name + ' Volume', 'tvSpeakerService');
		this.tvSpeakerService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
		this.tvSpeakerService
			.getCharacteristic(Characteristic.VolumeSelector)
			.on('set', (state, callback) => {
				this.log.debug('Remote control (VolumeSelector), pressed: %s', state === 1 ? 'Down' : 'Up');
				this.setVolumeSwitch(state, callback, !state);
			});
		
		this.tvAccesory.addService(this.tvSpeakerService);
		this.tvService.addLinkedService(this.tvSpeakerService);
	}

	setupInputSourcesService() {
		if (traceOn)
			this.log.debug('setupInputSourcesService: %s', this.name);
		if (this.inputs === undefined || this.inputs === null || this.inputs.length <= 0) {
			return;
		}

		if (Array.isArray(this.inputs) === false) {
			this.inputs = [this.inputs];
		}

		let savedNames = {};

		this.inputs.forEach((value, i) => {

			// get inputID
			let inputID = null;

			if (value.inputID !== undefined) {
				inputID = value.inputID;
			} else {
				inputID = value;
			}

			// get name		
			let inputName = inputID;

			if (savedNames && savedNames[inputID]) {
				inputName = savedNames[inputID];
			} else if (value.name) {
				inputName = value.name;
			}

			// if inputID not null or empty add the input
			if (inputID !== undefined && inputID !== null && inputID !== '') {
				inputID = inputID.replace(/\s/g, ''); // remove all white spaces from the string

				let tempInput = new Service.InputSource(inputID, 'inputSource' + i);
				tempInput
					.setCharacteristic(Characteristic.Identifier, i)
					.setCharacteristic(Characteristic.ConfiguredName, inputName)
					.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
					.setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.APPLICATION)
					.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

				tempInput
					.getCharacteristic(Characteristic.ConfiguredName)
					.on('set', (name, callback) => {
						savedNames[inputID] = name;
						callback()
					});

				this.tvAccesory.addService(tempInput);
				if (!tempInput.linked)
					this.tvService.addLinkedService(tempInput);
				this.inputIDs.push(inputID);
			}

		});
	}	
	/*****************************************
	* End of TV integration service 
	****************************************/


	/*****************************************
	 * Start of helper methods
	 ****************************************/
	updateReceiverStatus(tvStatus) {
		if (traceOn)
			this.log.debug('updateReceiverStatus: %s', this.name);

		if (!tvStatus) {
			if (this.powerService) 
				this.powerService
					.getCharacteristic(Characteristic.On)
					.updateValue(false);
			if (this.tvService) 
				this.tvService
					.getCharacteristic(Characteristic.Active)
					.updateValue(false); //tv service
			if (this.volumeService) 
				this.volumeService
					.getCharacteristic(Characteristic.On)
					.updateValue(false);
		} else {
			if (this.powerService) 
				this.powerService
					.getCharacteristic(Characteristic.On)
					.updateValue(true);
			if (this.tvService) {
				this.tvService
					.getCharacteristic(Characteristic.Active)
					.updateValue(true); //tv service
				}
		}
	}

	setReceiverState(stateInfo) {
		if (stateInfo.power) {
			if ( stateInfo.power === 'ON' ) {
				this.connected = true;
			} else {
				this.connected = false;
			}
			this.updateReceiverStatus(this.connected);
		}
		if (stateInfo.inputID) {
			if (this.connected = true) {
				let inputName = stateInfo.inputID;
				for (let i = 0; i < this.inputIDs.length; i++) {
					if (inputName === this.inputIDs[i]) {
						if (this.inputIDSet === false)
							this.tvService
								.getCharacteristic(Characteristic.ActiveIdentifier)
								.updateValue(i);
						else 
							this.inputIDSet = false;	
					}
				}
			}
		}
		if (stateInfo.masterVol) {}
		if (stateInfo.mute) {}
	}
	/*****************************************
	 * End of helper methods
	 ****************************************/

 	/*****************************************
	 * Start of Homebridge Setters/Getters
	 ****************************************/
	checkReceiverState(callback) {	
		if (traceOn)
			this.log.error('checkReceiverState: %s', this.name);	
			
		var that = this;
		request('http://' + this.ip + ':' + this.webAPIPort + '/goform/formMainZone_MainZoneXmlStatusLite.xml', function(error, response, body) {
			if(error) {
				that.log.error("ERROR: Can't connect to receiver with ip: %s and port: %s", that.ip, that.webAPIPort);
				that.log.debug(error);
				that.connected = false;
			} else if (body.indexOf('Error 403: Forbidden') === 0) {
				that.log.error('ERROR: Can not access receiver with IP: %s. Might be due to a wrong port. Try 80 or 8080 manually in config file.', that.ip);
			} else {
				parseString(body, function (err, result) {
				if(err) {
					that.log.debug("Error while parsing checkReceiverState. %s", err);
				}
				else {		
					
				}
				});
			}
		});
		callback(null, this.connected, this.inputID);
	}


	getPowerState(callback) {
		if (traceOn)
			this.log.debug('getPowerState: %s', this.name);
		callback(null, this.connected);
	}

	setPowerState(state, callback) {
		if (traceOn)
			this.log.debug('setPowerState state: %s', this.name);
		var that = this;
	
		var stateString = (state ? 'On' : 'Standby');
				
		request('http://' + that.ip + ':' + this.webAPIPort + '/goform/formiPhoneAppPower.xml?1+Power' + stateString, function(error, response, body) {
			if(error) {
				that.log.error("ERROR: Can't connect to receiver with ip: %s and port: %s", that.ip, that.webAPIPort);
				that.log.debug(error);
				callback(error);
			} else if (body.indexOf('Error 403: Forbidden') === 0) {
				that.log.error('ERROR: Can not access receiver with IP: %s. Might be due to a wrong port. Try 80 or 8080 manually in config file.', that.ip);
			} else if(state) {
				that.connected = true;

				/* Update possible other switches and accessories too */
				let stateInfo = {
					power: state ? 'ON' : 'OFF',
					inputID: null,
					masterVol: null,
					mute: null
				}
				that.recv.updateReceiverState(that.recv, stateInfo, that.name);

				callback();
			} else {
				that.connected = false;

				/* Update possible other switches and accessories too */
				let stateInfo = {
					power: state ? 'ON' : 'OFF',
					inputID: null,
					masterVol: null,
					mute: null
				}
				that.recv.updateReceiverState(that.recv, stateInfo, that.name);
				
				callback();
			}
		});
	}

	setVolume(level, callback) {
		if (traceOn)
			this.log.debug('setVolume: %s', this.name);	
		if (this.connected) {
			/* Update possible other switches and accessories too */
			let stateInfo = {
				power: null,
				inputID: null,
				masterVol: null,
				mute: null
			}
			that.recv.updateReceiverState(that.recv, stateInfo, that.name);

			callback();
		} else {
			/* Update possible other switches and accessories too */
			let stateInfo = {
				power: null,
				inputID: null,
				masterVol: null,
				mute: null
			}
			that.recv.updateReceiverState(that.recv, stateInfo, that.name);

			callback();
		}
	}

	getVolumeSwitch(callback) {
		if (traceOn)
			this.log.debug('getVolumeSwitch: %s', this.name);
		callback(null, false);
	}

	setVolumeSwitch(state, callback, isUp) {
		if (traceOn)
			this.log.debug('setVolumeSwitch: %s', this.name);
		var that = this;
		if (this.connected) {
			var stateString = (isUp ? 'MVUP' : 'MVDOWN');
							
			request('http://' + this.ip + ':' + this.webAPIPort + '/goform/formiPhoneAppDirect.xml?' + stateString, function(error, response, body) {
				if(error) {
					that.log.error("ERROR: Can't connect to receiver with ip: %s and port: %s", that.ip, that.webAPIPort);
					that.log.debug(error);
				} else if (body.indexOf('Error 403: Forbidden') === 0) {
					that.log.error('ERROR: Can not access receiver with IP: %s. Might be due to a wrong port. Try 80 or 8080 manually in config file.', that.ip);
				} 
			});
		}
		callback();
	}

	getAppSwitchState(callback) {
		if (traceOn)
			this.log.debug('getAppSwitchState');
		if (this.connected) {
			var that = this;

			request('http://' + this.ip + ':' + this.webAPIPort + '/goform/formMainZone_MainZoneXmlStatusLite.xml', function(error, response, body) {
				if(error) {
					that.log.error("ERROR: Can't connect to receiver with ip: %s and port: %s", that.ip, that.webAPIPort);
					that.log.debug(error);
				} else if (body.indexOf('Error 403: Forbidden') === 0) {
					that.log.error('ERROR: Can not access receiver with IP: %s. Might be due to a wrong port. Try 80 or 8080 manually in config file.', that.ip);
				} else {
					parseString(body, function (err, result) {
						if(err) {
							that.log.debug("Error while parsing getAppSwitchState. %s", err);
							callback(err);
						}
						else {		
							let inputName = result.item.InputFuncSelect[0].value[0];
							for (let i = 0; i < that.inputIDs.length; i++) {
								if (inputName === that.inputIDs[i]) {
									that.tvService
										.getCharacteristic(Characteristic.ActiveIdentifier)
										.updateValue(i);
								}
							}
							callback();
						}
					});
				}
			});
		} else {
			callback();
		}
	}

	setAppSwitchState(state, callback, inputName) {
		let inputNameN = inputName.replace('/', '%2F');
		
		if (traceOn)
			this.log.debug('setAppSwitchState: %s', this.name);
		if (this.connected) {
			if (state) {
				this.inputIDSet = true;

				var that = this;
				request('http://' + that.ip + ':' + this.webAPIPort + '/goform/formiPhoneAppDirect.xml?SI' + inputNameN, function(error, response, body) {
					if(error) {
						that.log.error("ERROR: Can't connect to receiver with ip: %s and port: %s", that.ip, that.webAPIPort);
						that.log.debug(error);
						if (callback)
							callback(error);

					} else if (body.indexOf('Error 403: Forbidden') === 0) {
						that.log.error('ERROR: Can not access receiver with IP: %s. Might be due to a wrong port. Try 80 or 8080 manually in config file.', that.ip);
					} else {
						/* Update possible other switches and accessories too */
						let stateInfo = {
							power: state ? 'ON' : 'OFF',
							inputID: inputName,
							masterVol: null,
							mute: null
						}
						that.recv.updateReceiverState(that.recv, stateInfo, that.name);

						if (callback)
							callback();
					}
				});
			}
		} else if (callback) {
			callback();
		}
	}

	remoteKeyPress(remoteKey, callback) {
		if (traceOn)
			this.log.debug('Denon - remote key pressed: %d', remoteKey);
		var ctrlString = '';

		switch (remoteKey) {
			case Characteristic.RemoteKey.REWIND:
				break;
			case Characteristic.RemoteKey.FAST_FORWARD:
				break;
			case Characteristic.RemoteKey.NEXT_TRACK:
				break;
			case Characteristic.RemoteKey.PREVIOUS_TRACK:
				break;
			case Characteristic.RemoteKey.ARROW_UP:
				ctrlString = 'MNCUP';
				break;
			case Characteristic.RemoteKey.ARROW_DOWN:
				ctrlString = 'MNCDN';
				break;
			case Characteristic.RemoteKey.ARROW_LEFT:
				ctrlString = 'MNCLT';
				break;
			case Characteristic.RemoteKey.ARROW_RIGHT:
				ctrlString = 'MNCRT';
				break;
			case Characteristic.RemoteKey.SELECT:
				ctrlString = 'MNENT';
				break;
			case Characteristic.RemoteKey.BACK:
				ctrlString = 'MNRTN';
				break;
			case Characteristic.RemoteKey.EXIT:
				break;
			case Characteristic.RemoteKey.PLAY_PAUSE:
				break;
			case Characteristic.RemoteKey.INFORMATION:
				ctrlString = this.infoButton;
				break;
		}

		var that = this;
		if (this.connected) {			
			request('http://' + this.ip + ':' + this.webAPIPort + '/goform/formiPhoneAppDirect.xml?' + ctrlString, function(error, response, body) {
			// callback();
			});
		}
		callback();
	}

	getName() {
		return this.name;
	}
	/*****************************************
	* End of Homebridge Setters/Getters
	****************************************/
}

class legacyClient {
	constructor(recv, switches) {
		this.log = recv.log;
		this.port = 3000;
		this.api = recv.api;
		this.recv = recv;

		this.webAPIPort = recv.webAPIPort;
		this.devInfoSet = false;

		this.manufacturer = recv.manufacturer;
		this.modelName = recv.modelName;
		this.serialNumber = recv.serialNumber;
		this.firmwareRevision = recv.firmwareRevision;

		// configuration
		this.name = switches.name || 'Denon Input';
		this.ip = switches.ip;
		this.inputID = switches.inputID;
		this.pollAllInput = switches.pollAllInput || false;

		/* setup variables */
		this.connected = false;

		this.setupLegacyService();
	}

	/*****************************************
	 * Start of legacy service 
	 ****************************************/
	setupLegacyService() {
		if (traceOn)
			this.log.debug('setupLegacyService: %s', this.name);
			
		/* Delay to wait for retrieve device info */
		var uuid = UUIDGen.generate(this.name+this.ip);

		this.accessory =  new Accessory(this.name, uuid);

		this.accessory.reachable = true;
		
		this.accessory.context.name = this.name;
		this.accessory.context.ip = this.ip;
		this.accessory.context.inputID = this.inputID;
		this.accessory.context.pollAllInput = this.pollAllInput;

		let isCached = this.testCachedAccessories();
		if (!isCached) {
			this.switchService = new Service.Switch(this.name, 'legacyInput');
			this.switchService
				.getCharacteristic(Characteristic.On)
				.on('get', this.getPowerStateLegacy.bind(this))
				.on('set', this.setPowerStateLegacy.bind(this));

			this.accessory
				.getService(Service.AccessoryInformation)
				.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
				.setCharacteristic(Characteristic.Model, this.modelName)
				.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
				.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

			this.accessory.addService(this.switchService);

			this.api.registerPlatformAccessories(pluginName, platformName, [this.accessory]);
		} else {
			this.accessory
				.getService(Service.Switch)
				.getCharacteristic(Characteristic.On)
				.on('get', this.getPowerStateLegacy.bind(this))
				.on('set', this.setPowerStateLegacy.bind(this));
		}
	}

	setReceiverState(stateInfo) {
		if (stateInfo.power && stateInfo.inputID) {
			if (stateInfo.power === 'ON' && (this.pollAllInput || stateInfo.inputID === this.inputID)) { 
				this.connected = true;
			} else {
				this.connected = false;
			}
			if (this.accessory) {
				this.accessory
					.getService(Service.Switch)
					.getCharacteristic(Characteristic.On)
					.updateValue(this.connected);
			}
		} else if (stateInfo.power && !stateInfo.inputID) {
			if (stateInfo.power === 'ON' && this.pollAllInput) { 
				this.connected = true;
			} else {
				this.connected = false;
			}
			if (this.accessory) {
				this.accessory
					.getService(Service.Switch)
					.getCharacteristic(Characteristic.On)
					.updateValue(this.connected);
			}
		}
		if (stateInfo.masterVol) {}
		if (stateInfo.mute) {}
	}

	getPowerStateLegacy(callback) {
		if (traceOn)
			this.log.debug('getPowerStateLegacy: %s', this.name);

		var that = this;
		request('http://' + that.ip + ':' + this.webAPIPort + '/goform/formMainZone_MainZoneXmlStatusLite.xml', function(error, response, body) {
			if(error) {
				that.log.error("ERROR: Can't connect to receiver with ip: %s and port: %s", that.ip, that.webAPIPort);
				that.log.debug(error);
				that.connected = false;
			} else if (body.indexOf('Error 403: Forbidden') === 0) {
				that.log.error('ERROR: Can not access receiver with IP: %s. Might be due to a wrong port. Try 80 or 8080 manually in config file.', that.ip);
			} else {
				parseString(body, function (err, result) {
					if(err) {
						that.log.debug("Error while parsing getPowerStateLegacy. %s", err);
					}
					else {	
						//It is on if it is powered and the correct input is selected.
						if (result.item.Power[0].value[0] === 'ON' && (result.item.InputFuncSelect[0].value[0] == that.inputID || that.pollAllInput)) {
							that.connected = true;
						} else {
							that.connected = false;
						}
						callback(null, that.connected);
					}
				});
			}
		});
	}

	setPowerStateLegacy(state, callback) {
		if (traceOn)
			this.log.debug('setPowerStateLegacy state: %s', this.name);

		var stateString = (state ? 'On' : 'Standby');

		var that = this;
		request('http://' + that.ip + ':' + this.webAPIPort + '/goform/formiPhoneAppPower.xml?1+Power' + stateString, function(error, response, body) {
			if(error) {
				that.log.error("ERROR: Can't connect to receiver with ip: %s and port: %s", that.ip, that.webAPIPort);
				that.log.debug(error);
				callback(error);
			} else if (body.indexOf('Error 403: Forbidden') === 0) {
				that.log.error('ERROR: Can not access receiver with IP: %s. Might be due to a wrong port. Try 80 or 8080 manually in config file.', that.ip);
			} else if(state) {
				/* Switch to correct input if switching on and legacy service */
				let inputName = that.inputID;
				inputName = inputName.replace('/', '%2F');
				request('http://' + that.ip + ':' + that.webAPIPort + '/goform/formiPhoneAppDirect.xml?SI' + inputName, function(error, response, body) {
					if(error) {
						that.log.error("ERROR: Can't connect to receiver with ip: %s and port: %s", that.ip, that.webAPIPort);
						that.log.debug(error);
						callback(error);
					} else {
						that.connected = true;

						/* Update possible other switches and accessories too */
						let stateInfo = {
							power: that.connected ? 'ON' : 'OFF',
							inputID: that.inputID,
							masterVol: null,
							mute: null
						}
						that.recv.updateReceiverState(that.recv, stateInfo, that.name);

						callback();
					}
				});
			} else {
				that.connected = false;

				/* Update possible other switches and accessories too */
				let stateInfo = {
					power: that.connected ? 'ON' : 'OFF',
					inputID: that.inputID,
					masterVol: null,
					mute: null
				}
				that.recv.updateReceiverState(that.recv, stateInfo, that.name);

				callback();
			}
		});
	}

	testCachedAccessories() {
		for (let i in cachedAccessories) {
			if (cachedAccessories[i].context.name === this.accessory.context.name && 
				cachedAccessories[i].context.ip === this.accessory.context.ip && 
				cachedAccessories[i].context.inputID === this.accessory.context.inputID && 
				cachedAccessories[i].context.pollAllInput === this.accessory.context.pollAllInput) {
				this.accessory = cachedAccessories[i];
				cachedAccessories.splice(i,1);
				return true;
			}
		}
		return false;
	}

	getName() {
		return this.name;
	}
	/*****************************************
	 * End of legacy service 
	 ****************************************/
}


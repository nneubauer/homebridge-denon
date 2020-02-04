const request = require('request');
const parseString = require('xml2js').parseString;

/* Include lib */
const discover = require('./lib/discover');

const pluginName = 'hombridge-denon-heos';
const platformName = 'DenonAVR';
const pluginVersion = '2.2.0';

const infoRetDelay = 250;
const defaultTrace = true;
const autoDiscoverTime = 3000;
const setAVRState = false;
/* Setup settings button and info button */
const infoMenu = 'MNINF';
const settingsMenu = 'MNMEN ON';

const bitMask = {
	power:   1,
	inputID: 2,
	volume:  4,
	mute:    8
}

let Service;
let Characteristic;
let Accessory;
let UUIDGen;

var traceOn;
var debugToInfo;
var discoverDev;
var g_log;

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

exports.logDebug = function(string) {
	if (!debugToInfo)
		g_log.debug(string);
	else 
		g_log.warn(string);
}
function logDebug(string) {
	if (!debugToInfo)
		g_log.debug(string);
	else 
		g_log.warn(string);
}

class denonClient {
	constructor(log, config, api) {
		this.log = log;
		this.port = 3000;
		this.api = api;

		g_log = log;

		this.api.on('didFinishLaunching', function() {
			this.log.debug("DidFinishLaunching");
			didFinishLaunching = true;
		}.bind(this));

		traceOn = config.debugTrace || defaultTrace;

		debugToInfo = config.debugToInfo || false;

		/* Search for all available Denon receivers */
		discoverDev = new discover(this, this.log, foundReceivers, autoDiscoverTime, pluginVersion);
		
		this.configReceivers = [];

		for (let i in config.switches) {
			if (!this.configReceivers[config.switches[i].ip])
				this.configReceivers[config.switches[i].ip] = new receiver(this, config, config.switches[i].ip);
		}

		for (let i in config.devices) {
			if (!this.configReceivers[config.devices[i].ip])
				this.configReceivers[config.devices[i].ip] = new receiver(this, config, config.devices[i].ip);
		}

		for (let i in config.volumeControl) {
			if (!this.configReceivers[config.volumeControl[i].ip])
				this.configReceivers[config.volumeControl[i].ip] = new receiver(this, config, config.volumeControl[i].ip);
		}

		setTimeout(this.removeCachedAccessory.bind(this), autoDiscoverTime+500);
	}

	configureAccessory(platformAccessory){
		if (traceOn)
			logDebug('DEBUG: configureAccessory');

		platformAccessory.reachable = true;
		cachedAccessories.push(platformAccessory);
	}
	removeAccessory(platformAccessory){
		if (traceOn)
			logDebug('DEBUG: removeAccessory');

		this.api.unregisterPlatformAccessories(pluginName, platformName, [platformAccessory]);
	}
	removeCachedAccessory(){
		if (traceOn)
			logDebug('DEBUG: removeCachedAccessory');

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
		this.volumeAccessories = [];

		this.switches = config.switches;
		this.devices = config.devices;
		this.volumeControl = config.volumeControl;

		logDebug('DEBUG: Start receiver with ip: ' + this.ip);

		this.pollingInterval = config.pollInterval || 3;
		this.pollingInterval = this.pollingInterval * 1000;

		this.devInfoSet = false;

		this.manufacturer = 'Denon';
		this.modelName = pluginName;
		this.serialNumber = 'MVV123';
		this.firmwareRevision = pluginVersion;

		this.disableReceiver = false;
		this.pollingTimeout = false;
		this.usesManualPort = false;

		this.webAPIPort = null;
		this.checkAliveInterval = null;

		this.poweredOn = false;
		this.currentInputID;
		this.volDisp = null;
		this.volumeLevel = 0;
		this.muteState = false;

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

		for (let i in this.volumeControl) {
			if (this.volumeControl[i].ip === this.ip) {
				if (this.webAPIPort === null || this.webAPIPort === 'auto') {
					this.webAPIPort = this.volumeControl[i].port || 'auto';
					if(this.webAPIPort != 'auto') 
						this.webAPIPort = this.webAPIPort.toString();
				} else {
					let temp = this.volumeControl[i].port || 'auto';
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
			logDebug('DEBUG: Manual port ' + this.webAPIPort + ' set: ' + this.ip);
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

		for (let i in this.volumeControl) {
			if (this.volumeControl[i].ip === this.ip)
				this.volumeAccessories.push(new volumeClient(this, this.volumeControl[i]));
		}
			
		/* start the polling */
		setTimeout(this.startPolling, Math.random() * 3000, this);
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
			logDebug('DEBUG: pollForUpdates: ' + this.ip);

		/* Make sure that no poll is happening just after switch in input/power */
		if (this.pollingTimeout) {
			this.pollingTimeout = false;
			return;
		}

		var that = this;
		request('http://' + that.ip + ':' + this.webAPIPort + '/goform/formMainZone_MainZoneXmlStatusLite.xml', function(error, response, body) {
			if(error) {
				that.log.error("ERROR: Can't connect to receiver with ip: %s and port: %s", that.ip, that.webAPIPort);
				logDebug('DEBUG: ' + error);
			} else if (body.indexOf('Error 403: Forbidden') === 0) {
				that.log.error('ERROR: Can not access receiver with IP: %s. Might be due to a wrong port. Try 80 or 8080 manually in config file.', that.ip);
			} else {
				parseString(body, function (err, result) {
					if(err) {
						logDebug("Error while parsing pollForUpdates. " + err);
					}
					else {	
						if (that.volDisp === null)
							that.volDisp = result.item.VolumeDisplay[0].value[0];
						
						let powerState = false;
						if (result.item.Power[0].value[0] === 'ON' )
							powerState = true; 

						/* Parse volume of receiver to 0-100% */
						let volLevel;
						if ( that.volDisp === 'Absolute' ) {
							volLevel = parseInt(result.item.MasterVolume[0].value[0]);
							volLevel = volLevel + 80;
						}

						/* Parse mutestate receiver to bool of HB */
						let muteState = false;
						if (result.item.Mute[0].value[0] === 'on' )
							muteState = true;

						let stateInfo = {
							power: powerState,
							inputID: result.item.InputFuncSelect[0].value[0],
							masterVol: volLevel,
							mute: muteState
						}

						if (!that.pollingTimeout)
							that.updateStates(that, stateInfo, null);
					}
				});
			}
		});
	}



	/*
	 * Used to update the state of all. Disable polling for one poll.
	 */
	updateStates(that, stateInfo, curName) {
		if (curName)
			that.pollingTimeout = true;

		if (stateInfo.power === true || stateInfo.power === false)
			that.poweredOn = stateInfo.power;

		if (stateInfo.inputID)
			that.currentInputID = stateInfo.inputID;

		if (stateInfo.mute === true || stateInfo.mute === false)
			that.muteState = stateInfo.mute;
		
		if (stateInfo.masterVol)
			that.volumeLevel = stateInfo.masterVol;

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

		for (let i in that.volumeAccessories) {
			if (that.volumeAccessories[i].getName() != curName) {
				that.volumeAccessories[i].setReceiverState(stateInfo);
			}
		}
		
	}

	manualUpdate(that, updateType, callback) {
		if (!that.pollingTimeout)
			that.pollingTimeout = true;
		else {
			if (updateType & bitMask.power > 0)
				callback(null, that.poweredOn);
			if (updateType & bitMask.inputID > 0)
				callback(null, that.currentInputID);
			if (updateType & bitMask.volume > 0)
				callback(null, that.volumeLevel);
			if (updateType & bitMask.mute > 0)
				callback(null, that.muteState);
			return;
		}

		request('http://' + that.ip + ':' + that.webAPIPort + '/goform/formMainZone_MainZoneXmlStatusLite.xml', function(error, response, body) {
			if(error) {
				that.log.error("ERROR: Can't connect to receiver with ip: %s and port: %s", that.ip, that.webAPIPort);
				logDebug('DEBUG: ' + error);
			} else if (body.indexOf('Error 403: Forbidden') === 0) {
				that.log.error('ERROR: Can not access receiver with IP: %s. Might be due to a wrong port. Try 80 or 8080 manually in config file.', that.ip);
			} else {
				parseString(body, function (err, result) {
					if(err) {
						logDebug("Error while parsing getPowerStateLegacy. " + err);
					}
					else {	
						if (that.volDisp === null)
							that.volDisp = result.item.VolumeDisplay[0].value[0]; 

						if ( result.item.Power[0].value[0] === 'ON' )
							that.poweredOn = true;
						else
							that.poweredOn = false;

						that.currentInputID = result.item.InputFuncSelect[0].value[0];

						/* Parse volume of receiver to 0-100% */
						let volLevel;
						if ( that.volDisp === 'Absolute' ) {
							volLevel = parseInt(result.item.MasterVolume[0].value[0]);
							that.volumeLevel = volLevel + 80;
						}

						/* Parse mutestate receiver to bool of HB */
						if (result.item.Mute[0].value[0] === 'on' )
							that.muteState = true;
						else
							that.muteState = false;

						if (updateType & bitMask.power > 0)
							callback(null, that.poweredOn);
						if (updateType & bitMask.inputID > 0)
							callback(null, that.currentInputID);
						if (updateType & bitMask.volume > 0)
							callback(null, that.volumeLevel);
						if (updateType & bitMask.mute > 0)
							callback(null, that.muteState);
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

		this.tvServicePort = recv.webAPIPort;

		this.manufacturer = recv.manufacturer;
		this.modelName = recv.modelName;
		this.serialNumber = recv.serialNumber;
		this.firmwareRevision = recv.firmwareRevision;

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
			logDebug('DEBUG: setupTvService: ' + this.name);

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
				if (this.recv.poweredOn) {

					request('http://' + this.ip + ':' + this.tvServicePort + '/goform/formiPhoneAppDirect.xml?' + this.menuButton, function(error, response, body) {});
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


		logDebug('DEBUG: publishExternalAccessories: ' + this.name);
		this.api.publishExternalAccessories(pluginName, [this.tvAccesory]);
	}

	setupTvSpeakerService() {
		if (traceOn)
			logDebug('DEBUG: setupTvSpeakerService: ' + this.name);
		this.tvSpeakerService = new Service.TelevisionSpeaker(this.name + ' Volume', 'tvSpeakerService');
		this.tvSpeakerService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
		this.tvSpeakerService
			.getCharacteristic(Characteristic.VolumeSelector)
			.on('set', (state, callback) => {
				logDebug('DEBUG: Remote control (VolumeSelector), pressed: ' + state === 1 ? 'Down' : 'Up');
				this.setVolumeSwitch(state, callback, !state);
			});
		
		this.tvAccesory.addService(this.tvSpeakerService);
		this.tvService.addLinkedService(this.tvSpeakerService);
	}

	setupInputSourcesService() {
		if (traceOn)
			logDebug('DEBUG: setupInputSourcesService: ' + this.name);
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
	updateReceiverState(tvStatus) {
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
		if (traceOn && setAVRState)
			logDebug('DEBUG: setReceiverState: ' + this.name); 
		
		if (stateInfo.power === true || stateInfo.power === false)
			this.updateReceiverState(this.recv.poweredOn);

		if (stateInfo.inputID) {
			if (this.recv.poweredOn) {
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
	}
	/*****************************************
	 * End of helper methods
	 ****************************************/

 	/*****************************************
	 * Start of Homebridge Setters/Getters
	 ****************************************/
	getPowerState(callback) {
		if (traceOn)
			logDebug('DEBUG: getPowerState: ' + this.name);

		callback(null, this.recv.poweredOn ? 1 : 0);
	}

	setPowerState(state, callback) {
		if (traceOn)
			logDebug('DEBUG: setPowerState state: ' + this.name);

		if (state === 0)
			state = false;
		else if (state === 1)
			state = true;
	
		var stateString = (state ? 'On' : 'Standby');
				
		var that = this;
		request('http://' + that.ip + ':' + this.tvServicePort + '/goform/formiPhoneAppPower.xml?1+Power' + stateString, function(error, response, body) {
			if(error) {
				that.log.error("ERROR: Can't connect to receiver with ip: %s and port: %s", that.ip, that.tvServicePort);
				logDebug('DEBUG: ' + error);
				callback(error);
			} else if (body.indexOf('Error 403: Forbidden') === 0) {
				that.log.error('ERROR: Can not access receiver with IP: %s. Might be due to a wrong port. Try 80 or 8080 manually in config file.', that.ip);
			} else {
				/* Update possible other switches and accessories too */
				let stateInfo = {
					power: state,
					inputID: null,
					masterVol: null,
					mute: null
				}
				that.recv.updateStates(that.recv, stateInfo, that.name);

				callback();
			}
		});
	}

	// getVolumeSwitch(callback) {
	// 	if (traceOn)
	// 		logDebug('DEBUG: getVolumeSwitch: ' + this.name);
	// 	callback(null, false);
	// }

	setVolumeSwitch(state, callback, isUp) {
		if (traceOn)
			logDebug('DEBUG: setVolumeSwitch: ' + this.name);

		var that = this;
		if (this.recv.poweredOn) {
			var stateString = (isUp ? 'MVUP' : 'MVDOWN');
							
			request('http://' + this.ip + ':' + this.tvServicePort + '/goform/formiPhoneAppDirect.xml?' + stateString, function(error, response, body) {
				if(error) {
					that.log.error("ERROR: Can't connect to receiver with ip: %s and port: %s", that.ip, that.tvServicePort);
					logDebug('DEBUG: ' + error);
				} else if (body.indexOf('Error 403: Forbidden') === 0) {
					that.log.error('ERROR: Can not access receiver with IP: %s. Might be due to a wrong port. Try 80 or 8080 manually in config file.', that.ip);
				} 
			});
		}
		callback();
	}

	getAppSwitchState(callback) {
		if (traceOn)
			logDebug('DEBUG: getAppSwitchState');

		if (this.recv.poweredOn) {
			let inputName = this.recv.currentInputID;
			for (let i = 0; i < this.inputIDs.length; i++) {
				if (inputName === this.inputIDs[i]) {
					this.tvService
						.getCharacteristic(Characteristic.ActiveIdentifier)
						.updateValue(i);
				}
			}
		}
		callback();
	}

	setAppSwitchState(state, callback, inputName) {
		if (traceOn)
			logDebug('DEBUG: setAppSwitchState: ' + this.name);

		this.inputIDSet = true;

		let inputNameN = inputName.replace('/', '%2F');

		var that = this;
		request('http://' + that.ip + ':' + this.tvServicePort + '/goform/formiPhoneAppDirect.xml?SI' + inputNameN, function(error, response, body) {
			if(error) {
				that.log.error("ERROR: Can't connect to receiver with ip: %s and port: %s", that.ip, that.tvServicePort);
				logDebug('DEBUG: ' + error);
				if (callback)
					callback(error);

			} else if (body.indexOf('Error 403: Forbidden') === 0) {
				that.log.error('ERROR: Can not access receiver with IP: %s. Might be due to a wrong port. Try 80 or 8080 manually in config file.', that.ip);
			} else {
				/* Update possible other switches and accessories too */
				let stateInfo = {
					power: null,
					inputID: inputName,
					masterVol: null,
					mute: null
				}
				that.recv.updateStates(that.recv, stateInfo, that.name);

				if (callback)
					callback();
			}
		});
	}

	remoteKeyPress(remoteKey, callback) {
		if (traceOn)
			logDebug('DEBUG: Denon - remote key pressed: ' + remoteKey);
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

		if (this.recv.poweredOn)			
			request('http://' + this.ip + ':' + this.tvServicePort + '/goform/formiPhoneAppDirect.xml?' + ctrlString, function(error, response, body) {});
		
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

		this.legacyPort = recv.webAPIPort;

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
		this.switchState = false;

		this.setupLegacyService();
	}

	/*****************************************
	 * Start of legacy service 
	 ****************************************/
	setupLegacyService() {
		if (traceOn)
			logDebug('DEBUG: setupLegacyService: ' + this.name);
			
		/* Delay to wait for retrieve device info */
		this.uuid = UUIDGen.generate(this.name+this.ip);

		this.accessory =  new Accessory(this.name, this.uuid);

		this.accessory.reachable = true;
		
		this.accessory.context.subtype = 'legacyInput';
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
		if (traceOn && setAVRState)
			logDebug('DEBUG: setReceiverState: ' + this.name);

		if ((stateInfo.power === true || stateInfo.power === false) && stateInfo.inputID) {
			if (stateInfo.power && (this.pollAllInput || stateInfo.inputID === this.inputID)) { 
				this.switchState = true;
			} else {
				this.switchState = false;
			}
			if (this.accessory) {
				this.accessory
					.getService(Service.Switch)
					.getCharacteristic(Characteristic.On)
					.updateValue(this.switchState);
			}
		} else if ((stateInfo.power === true || stateInfo.power === false) && !stateInfo.inputID) {
			if (stateInfo.power && this.pollAllInput) { 
				this.switchState = true;
			} else {
				this.switchState = false;
			}
			if (this.accessory) {
				this.accessory
					.getService(Service.Switch)
					.getCharacteristic(Characteristic.On)
					.updateValue(this.switchState);
			}
		}
	}

	getPowerStateLegacy(callback) {
		if (traceOn)
			logDebug('DEBUG: getPowerStateLegacy: ' + this.name);	
		
		let switchState = false;
		if (this.recv.poweredOn && (this.recv.currentInputID == this.inputID || this.pollAllInput))
			switchState = true
		
		callback(null, switchState);
	}

	setPowerStateLegacy(state, callback) {
		if (traceOn)
			logDebug('DEBUG: setPowerStateLegacy state: ' + this.name);

		var stateString = (state ? 'On' : 'Standby');

		var that = this;
		if (this.recv.poweredOn != state) {
			request('http://' + that.ip + ':' + this.legacyPort + '/goform/formiPhoneAppPower.xml?1+Power' + stateString, function(error, response, body) {
				if(error) {
					that.log.error("ERROR: Can't connect to receiver with ip: %s and port: %s", that.ip, that.legacyPort);
					logDebug('DEBUG: ' + error);
					callback(error);
				} else if (body.indexOf('Error 403: Forbidden') === 0) {
					that.log.error('ERROR: Can not access receiver with IP: %s. Might be due to a wrong port. Try 80 or 8080 manually in config file.', that.ip);
				} else if(state) {
					/* Switch to correct input if switching on and legacy service */
					let inputName = that.inputID;
					inputName = inputName.replace('/', '%2F');

					request('http://' + that.ip + ':' + that.legacyPort + '/goform/formiPhoneAppDirect.xml?SI' + inputName, function(error, response, body) {
						if(error) {
							that.log.error("ERROR: Can't connect to receiver with ip: %s and port: %s", that.ip, that.legacyPort);
							logDebug('DEBUG: ' + error);
							callback(error);
						} else {

							/* Update possible other switches and accessories too */
							let stateInfo = {
								power: state,
								inputID: that.inputID,
								masterVol: null,
								mute: null
							}
							that.recv.updateStates(that.recv, stateInfo, that.name);

							callback();
						}
					});
				} else {

					/* Update possible other switches and accessories too */
					let stateInfo = {
						power: state,
						inputID: that.inputID,
						masterVol: null,
						mute: null
					}
					that.recv.updateStates(that.recv, stateInfo, that.name);

					callback();
				}
			});
		} else {
			let inputName = that.inputID;
			inputName = inputName.replace('/', '%2F');

				request('http://' + that.ip + ':' + that.legacyPort + '/goform/formiPhoneAppDirect.xml?SI' + inputName, function(error, response, body) {
				if(error) {
					that.log.error("ERROR: Can't connect to receiver with ip: %s and port: %s", that.ip, that.legacyPort);
					logDebug('DEBUG: ' + error);
					callback(error);
				} else {
					/* Update possible other switches and accessories too */
					let stateInfo = {
						power: state,
						inputID: that.inputID,
						masterVol: null,
						mute: null
					}
					that.recv.updateStates(that.recv, stateInfo, that.name);

					callback();
				}
			});
		}
	}

	testCachedAccessories() {
		for (let i in cachedAccessories) {
			if (cachedAccessories[i].context.subtype == 'legacyInput') {
				if (cachedAccessories[i].context.name === this.accessory.context.name && 
					cachedAccessories[i].context.ip === this.accessory.context.ip && 
					cachedAccessories[i].context.inputID === this.accessory.context.inputID && 
					cachedAccessories[i].context.pollAllInput === this.accessory.context.pollAllInput) {
					this.accessory = cachedAccessories[i];
					cachedAccessories.splice(i,1);
					return true;
				}
				if (this.uuid == cachedAccessories[i].UUID) {
					this.api.unregisterPlatformAccessories(pluginName, platformName, [cachedAccessories[i]]);
					cachedAccessories.splice(i,1);
					return false;
				}
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


class volumeClient {
	constructor(recv, volumeControl) {
		this.log = recv.log;
		this.port = 3000;
		this.api = recv.api;
		this.recv = recv;

		this.volumePort = recv.webAPIPort;

		this.manufacturer = recv.manufacturer;
		this.modelName = recv.modelName;
		this.serialNumber = recv.serialNumber;
		this.firmwareRevision = recv.firmwareRevision;

		// configuration
		this.name = volumeControl.name || 'Denon Input';
		this.ip = volumeControl.ip;

		this.volumeLimit = volumeControl.volumeLimit || 100;
		if (typeof this.volumeLimit != 'number' || isFinite(this.volumeLimit))
			this.volumeLimit = parseInt(this.volumeLimit);
		if (this.volumeLimit < 0 || this.volumeLimit > 100)
			this.volumeLimit = 100;

		this.volume = 30;
		this.muteState = false;

		this.setupVolumeService();
	}

	/*****************************************
	 * Start of volume service 
	 ****************************************/
	setupVolumeService() {
		if (traceOn)
			logDebug('DEBUG: setupVolumeService: ' + this.name);
			
		/* Delay to wait for retrieve device info */
		this.uuid = UUIDGen.generate(this.name+this.ip);

		this.accessory =  new Accessory(this.name, this.uuid);

		this.accessory.reachable = true;
		
		this.accessory.context.subtype = 'volumeInput';
		this.accessory.context.name = this.name;
		this.accessory.context.ip = this.ip;
		this.accessory.context.volumeLimit = this.volumeLimit;

		let isCached = this.testCachedAccessories();
		if (!isCached) {
			this.volumeService = new Service.Lightbulb(this.name, 'volumeInput');
			this.volumeService
				.getCharacteristic(Characteristic.On)
				.on('get', this.getMuteState.bind(this))
				.on('set', this.setMuteState.bind(this));
			this.volumeService
				.addCharacteristic(new Characteristic.Brightness())
				.on('get', this.getVolume.bind(this))
				.on('set', this.setVolume.bind(this));

			this.accessory
				.getService(Service.AccessoryInformation)
				.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
				.setCharacteristic(Characteristic.Model, this.modelName)
				.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
				.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

			this.accessory.addService(this.volumeService);

			this.api.registerPlatformAccessories(pluginName, platformName, [this.accessory]);
		} else {
			this.accessory
				.getService(Service.Lightbulb)
				.getCharacteristic(Characteristic.On)
				.on('get', this.getMuteState.bind(this))
				.on('set', this.setMuteState.bind(this));
			this.accessory
				.getService(Service.Lightbulb)
				.getCharacteristic(Characteristic.Brightness)
				.on('get', this.getVolume.bind(this))
				.on('set', this.setVolume.bind(this));
		}
	}

	setReceiverState(stateInfo) {
		if (traceOn && setAVRState)
			logDebug('DEBUG: setReceiverState: ' + this.name);

		if (stateInfo.masterVol) {
			this.accessory
					.getService(Service.Lightbulb)
					.getCharacteristic(Characteristic.Brightness)
					.updateValue(this.recv.volumeLevel);
		}
		if ((stateInfo.mute === true || stateInfo.mute === false) && this.recv.poweredOn) {
			this.accessory
					.getService(Service.Lightbulb)
					.getCharacteristic(Characteristic.On)
					.updateValue(!this.recv.muteState);
		} else if (!this.recv.poweredOn) {
			this.accessory
					.getService(Service.Lightbulb)
					.getCharacteristic(Characteristic.On)
					.updateValue(false);
		}
	}

	getMuteState(callback) {
		if (traceOn)
			logDebug('DEBUG: getMuteState: ' + this.name);

		if (this.recv.poweredOn) {
			callback(null, !this.recv.muteState);
		} else {
			callback(null, false);
		}
	}

	setMuteState(state, callback) {
		if (traceOn)
			logDebug('DEBUG: setMuteState: ' + this.name);

		var stateString = (state ? 'MUOFF' : 'MUON');

		var that = this;
		request('http://' + this.ip + ':' + this.volumePort + '/goform/formiPhoneAppDirect.xml?' + stateString, function(error, response, body) {
			if(error) {
				that.log.error("ERROR: Can't connect to receiver with ip: %s and port: %s", that.ip, that.volumePort);
				logDebug('DEBUG: ' + error);
				callback(error);
			} else if (body.indexOf('Error 403: Forbidden') === 0) {
				that.log.error('ERROR: Can not access receiver with IP: %s. Might be due to a wrong port. Try 80 or 8080 manually in config file.', that.ip);
			} else {
				let stateInfo = {
					power: null,
					inputID: null,
					masterVol: null,
					mute: !state
				}
				that.recv.updateStates(that.recv, stateInfo, that.name);

				callback();
			}
		});
	}

	getVolume(callback) {
		if (traceOn)
			logDebug('DEBUG: getVolume: ' + this.name);

		if (this.recv.poweredOn) {
			callback(null, this.recv.volumeLevel);
		} else {
			callback(null, 0);
		}
	}

	setVolume(level, callback) {
		if (level > this.volumeLimit)
			level = this.volumeLimit;
		
		if (traceOn)
			logDebug('DEBUG: setVolume: ' + this.name + ' to :' + level);

		this.recv.volumeLevel = level;
		
		var that = this;
		request('http://' + that.ip + ':' + this.volumePort + '/goform/formiPhoneAppDirect.xml?MV' + level, function(error, response, body) {
			if(error) {
				that.log.error("ERROR: Can't connect to receiver with ip: %s and port: %s", that.ip, that.volumePort);
				logDebug('DEBUG: ' + error);
				callback(error);
			} else if (body.indexOf('Error 403: Forbidden') === 0) {
				that.log.error('ERROR: Can not access receiver with IP: %s. Might be due to a wrong port. Try 80 or 8080 manually in config file.', that.ip);
			} else {
				/* Update possible other switches and accessories too */
				let stateInfo = {
					power: null,
					inputID: null,
					masterVol: level,
					mute: null
				}
				that.recv.updateStates(that.recv, stateInfo, that.name);

				callback();
			}
		});
	}

	testCachedAccessories() {
		for (let i in cachedAccessories) {
			if (cachedAccessories[i].context.subtype == 'volumeInput') {
				if (cachedAccessories[i].context.name === this.accessory.context.name && 
					cachedAccessories[i].context.ip === this.accessory.context.ip && 
					cachedAccessories[i].context.volumeLimit === this.accessory.context.volumeLimit) {
					this.accessory = cachedAccessories[i];
					cachedAccessories.splice(i,1);
					return true;
				}
				if (this.uuid == cachedAccessories[i].UUID) {
					this.api.unregisterPlatformAccessories(pluginName, platformName, [cachedAccessories[i]]);
					cachedAccessories.splice(i,1);
					return false;
				}
			}
		}
		return false;
	}

	getName() {
		return this.name;
	}
	/*****************************************
	 * Volume service 
	 ****************************************/
}




const request = require('request');
const parseString = require('xml2js').parseString;

/* Include lib */
const discover = require('./lib/discover');

const pluginName = 'hombridge-denon-heos';
const platformName = 'DenonAVR';

const infoRetDelay = 250;
const defaultTrace = true;
const autoDiscoverTime = 5000;

let Service;
let Characteristic;
let Accessory;
let UUIDGen;

var pollingInterval;
/* Setup settings button and info button */
var infoMenu = 'MNINF';
var settingsMenu = 'MNMEN ON';

var traceOn

var discoverDev;
var foundReceivers = [];
var didFinishLaunching = false;
var cachedAccessories = [];

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
	  
		this.tvAccessories = [];
		this.legacyAccessories = [];

		this.pollingInterval = config.pollInterval || 3;
		this.pollingInterval = this.pollingInterval * 1000;

		pollingInterval = this.pollingInterval;

		this.devices = config.devices || [];
		this.switches = config.switches || [];

		traceOn = config.debugTrace || defaultTrace;



		/* Search for all available Denon receivers */
		discoverDev = new discover(this, this.log, foundReceivers, autoDiscoverTime);
		

		/* Configure devices */
		for (var i in this.switches) {
			this.legacyAccessories.push(new legacyClient(log, this.switches[i], api));
		}

		for (var i in this.devices) {
			this.tvAccessories.push(new tvClient(log, this.devices[i], api));
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

class tvClient {
	constructor(log, device, api, foundReceivers) {
		this.log = log;
		this.port = 3000;
		this.api = api;

		this.devInfoSet = false;

		this.manufacturer = 'Denon';
		this.modelName = device.model || 'homebridge-denon-heos';
		this.serialNumber = 'MVV123';
		this.firmwareRevision = '0.0';

		// configuration
		this.name = device.name || 'Denon Receiver';
		this.ip = device.ip;
		this.usesManualPort = false;

		this.webAPIPort = device.port || 'auto';
		if(this.webAPIPort != 'auto') {
			this.webAPIPort = this.webAPIPort.toString();
			this.usesManualPort = true;
		}

		discoverDev.setDenonInformation(this, this.log);
		
		
		// this.volumeControl = device.volumeControlBulb;
		// if (this.volumeControl === undefined) {
		// 	this.volumeControl = false;
		// }
		// this.volumeLimit = device.volumeLimit;
		// if (this.volumeLimit === undefined || isNaN(this.volumeLimit) || this.volumeLimit < 0) {
		// 	this.volumeLimit = 100;
		// }

		this.inputs = device.inputs;

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
		this.checkAliveInterval = null;
		
		/* Delay to wait for retrieve device info */
		setTimeout(this.setupTvService.bind(this), infoRetDelay);
	}

	getDevInfoSet() {
		return this.devInfoSet;
	}
	setDevInfoSet(set) {
		this.devInfoSet = set;
	}
	hasManualPort() {
		return this.usesManualPort;
	}
	returnPort() {
		return this.webAPIPort;
	}
	returnIP() {
		return this.ip;
	}


	/*****************************************
	 * Start of TV integration service 
	 ****************************************/
	setupTvService() {
		if (traceOn)
			this.log.debug('setupTvService');

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


		this.log.debug('publishExternalAccessories');
		this.api.publishExternalAccessories(pluginName, [this.tvAccesory]);

		/* start the polling */
		if (!this.checkAliveInterval) {
			this.checkAliveInterval = setInterval(this.checkReceiverState.bind(this, this.updateReceiverStatus.bind(this)), pollingInterval);
		} 
	}

	setupTvSpeakerService() {
		if (traceOn)
			this.log.debug('setupTvSpeakerService');
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
			this.log.debug('setupInputSourcesService');
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
	updateReceiverStatus(error, tvStatus, inputID) {
		if (traceOn)
			this.log.debug('updateReceiverStatus');
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
	/*****************************************
	 * End of helper methods
	 ****************************************/

 	/*****************************************
	 * Start of Homebridge Setters/Getters
	 ****************************************/
	checkReceiverState(callback) {	
		if (traceOn)
			this.log.debug('checkReceiverState');	
			
		var that = this;
		request('http://' + this.ip + ':' + this.webAPIPort + '/goform/formMainZone_MainZoneXmlStatusLite.xml', function(error, response, body) {
			if(error) {
				that.log.debug("Error while getting power state %s", error);
				that.connected = false;
			} else if (body.indexOf('Error 403: Forbidden') === 0) {
				that.log.error('Can not access receiver with IP: xx.xx.xx.xx. Might be due to a wrong port. Try 80 or 8080 manually in config file.', that.ip);
			} else {
				parseString(body, function (err, result) {
				if(err) {
					that.log.debug("Error while parsing checkReceiverState. %s", err);
				}
				else {		
					//It is on if it is powered and the correct input is selected.
					if ( result.item.Power[0].value[0] === 'ON' ) {
						let inputName = result.item.InputFuncSelect[0].value[0];
							for (let i = 0; i < that.inputIDs.length; i++) {
								if (inputName === that.inputIDs[i]) {
									if (that.inputIDSet === false)
										that.tvService
											.getCharacteristic(Characteristic.ActiveIdentifier)
											.updateValue(i);
									else 
										that.inputIDSet = false;	
								}
							}
						that.connected = true;
					} else {
						that.connected = false;
					}
				}
				});
			}
		});
		callback(null, this.connected, this.inputID);
	}


	getPowerState(callback) {
		if (traceOn)
			this.log.debug('getPowerState');
		callback(null, this.connected);
	}

	setPowerState(state, callback) {
		if (traceOn)
			this.log.debug('setPowerState state: %s', state ? 'On' : 'Off');
		var that = this;
	
		var stateString = (state ? 'On' : 'Standby');
				
		request('http://' + that.ip + ':' + this.webAPIPort + '/goform/formiPhoneAppPower.xml?1+Power' + stateString, function(error, response, body) {
			if(error) {
				that.log.debug("Error while setting power state %s", error);
				callback(error);
			} else if (body.indexOf('Error 403: Forbidden') === 0) {
				that.log.error('Can not access receiver with IP: xx.xx.xx.xx. Might be due to a wrong port. Try 80 or 8080 manually in config file.', that.ip);
			} else if(state) {
				that.connected = true;
				callback();
			} else {
				that.connected = false;
				callback();
			}
		});
	}

	setVolume(level, callback) {
		if (traceOn)
			this.log.debug('setVolume');	
		if (this.connected) {
			callback();
		} else {
			callback();
		}
	}

	getVolumeSwitch(callback) {
		if (traceOn)
			this.log.debug('getVolumeSwitch');
		callback(null, false);
	}

	setVolumeSwitch(state, callback, isUp) {
		if (traceOn)
			this.log.debug('setVolumeSwitch');
		var that = this;
		if (this.connected) {
			var stateString = (isUp ? 'MVUP' : 'MVDOWN');
							
			request('http://' + this.ip + ':' + this.webAPIPort + '/goform/formiPhoneAppDirect.xml?' + stateString, function(error, response, body) {
				if(error) {
					that.log.debug("Error while setting volume: %s", error);
				} else if (body.indexOf('Error 403: Forbidden') === 0) {
					that.log.error('Can not access receiver with IP: xx.xx.xx.xx. Might be due to a wrong port. Try 80 or 8080 manually in config file.', that.ip);
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
					that.log.debug("Error while getting power state %s", error);
				} else if (body.indexOf('Error 403: Forbidden') === 0) {
					that.log.error('Can not access receiver with IP: xx.xx.xx.xx. Might be due to a wrong port. Try 80 or 8080 manually in config file.', that.ip);
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
		inputName = inputName.replace('/', '%2F');
		
		if (traceOn)
			this.log.debug('setAppSwitchState');
		if (this.connected) {
			if (state) {
				var that = this;
				that.inputIDSet = true;

				request('http://' + that.ip + ':' + this.webAPIPort + '/goform/formiPhoneAppDirect.xml?SI' + inputName, function(error, response, body) {
						if(error) {
						that.log.debug("Error while switching input %s", error);
						if (callback)
							callback(error);

					} else if (body.indexOf('Error 403: Forbidden') === 0) {
						that.log.error('Can not access receiver with IP: xx.xx.xx.xx. Might be due to a wrong port. Try 80 or 8080 manually in config file.', that.ip);
					} else {
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
	/*****************************************
	* End of Homebridge Setters/Getters
	****************************************/
}

class legacyClient {
	constructor(log, switches, api) {
		this.log = log;
		this.port = 3000;
		this.api = api;

		this.devInfoSet = false;

		this.manufacturer = 'Denon';
		this.modelName = switches.model || 'homebridge-denon-heos';
		this.serialNumber = 'MVV123';
		this.firmwareRevision = '0.0';

		// configuration
		this.name = switches.name || 'Denon Input';
		this.ip = switches.ip;

		this.usesManualPort = false;

		this.webAPIPort = switches.port || 'auto';
		if(this.webAPIPort != 'auto') {
			this.webAPIPort = this.webAPIPort.toString();
			this.usesManualPort = true;
		}

		discoverDev.setDenonInformation(this, this.log);

		this.inputID = switches.inputID;

		/* setup variables */
		this.connected = false;
		this.checkAliveInterval = null;
			
		this.pollAllInput = switches.pollAllInput || false;

		/* Delay to wait for retrieve device info */
		var uuid = UUIDGen.generate(this.name+this.ip);

		this.accessory =  new Accessory(this.name, uuid);
		// this.api.unregisterPlatformAccessories(pluginName, platformName, [this.accessory]);

		setTimeout(this.setupLegacyService.bind(this), infoRetDelay);
	}

	/*****************************************
	 * Start of legacy service 
	 ****************************************/
	setupLegacyService() {
		if (traceOn)
			this.log.debug('setupLegacyService');

		if (!discoverDev.setDenonInformation(this, this.log) || !didFinishLaunching) {
			setTimeout(this.setupLegacyService.bind(this), infoRetDelay);
			return;
		}

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
			
		/* start the polling */
		setTimeout(this.startPolling, Math.random() * 3000, this);
		
	}

	startPolling (that) {
		if (!that.checkAliveInterval) {
			that.checkAliveInterval = setInterval(that.pollForUpdates.bind(that), pollingInterval);
		}
	}

	returnAccessory(){
		return this.accessory;
	}

	/*
	 * This will start a polling loop that goes on forever and updates
	 * the on characteristic periodically.
	 */
	pollForUpdates() {
		if (traceOn)
			this.log.debug('pollForUpdates');
		var that = this;

		request('http://' + that.ip + ':' + this.webAPIPort + '/goform/formMainZone_MainZoneXmlStatusLite.xml', function(error, response, body) {
			if(error) {
				that.log.debug("Error while getting power state %s", error);
				that.connected = false;
			} else if (body.indexOf('Error 403: Forbidden') === 0) {
				that.log.error('Can not access receiver with IP: xx.xx.xx.xx. Might be due to a wrong port. Try 80 or 8080 manually in config file.', that.ip);
			} else {
				parseString(body, function (err, result) {
					if(err) {
						that.log.debug("Error while parsing pollForUpdates. %s", err);
					}
					else {	
						// that.log.debug("Got power state to be %s", result.item.Power[0].value[0]);
						// that.log.debug("Got input state to be %s", result.item.InputFuncSelect[0].value[0]);

						//It is on if it is powered and the correct input is selected.
						if (result.item.Power[0].value[0] === 'ON' && (result.item.InputFuncSelect[0].value[0] == that.inputID || that.pollAllInput)) {
							that.connected = true;
						} else {
							that.connected = false;
						}
						if (that.accessory) {
								that.accessory
									.getService(Service.Switch)
									.getCharacteristic(Characteristic.On)
									.updateValue(that.connected);
						}
					}
				});
			}
		});
	}

	getPowerStateLegacy(callback) {
		if (traceOn)
			this.log.debug('getPowerStateLegacy');
		var that = this;

		request('http://' + that.ip + ':' + this.webAPIPort + '/goform/formMainZone_MainZoneXmlStatusLite.xml', function(error, response, body) {
			if(error) {
				that.log.debug("Error while getting power state %s", error);
				that.connected = false;
			} else if (body.indexOf('Error 403: Forbidden') === 0) {
				that.log.error('Can not access receiver with IP: xx.xx.xx.xx. Might be due to a wrong port. Try 80 or 8080 manually in config file.', that.ip);
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
			this.log.debug('setPowerStateLegacy state: %s', state ? 'On' : 'Off');
		var that = this;
	
		var stateString = (state ? 'On' : 'Standby');
			
		request('http://' + that.ip + ':' + this.webAPIPort + '/goform/formiPhoneAppPower.xml?1+Power' + stateString, function(error, response, body) {
			if(error) {
				that.log.debug("Error while setting power state %s", error);
				callback(error);
			} else if (body.indexOf('Error 403: Forbidden') === 0) {
				that.log.error('Can not access receiver with IP: xx.xx.xx.xx. Might be due to a wrong port. Try 80 or 8080 manually in config file.', that.ip);
			} else if(state) {
				/* Switch to correct input if switching on and legacy service */
					let inputName = that.inputID;
					inputName = inputName.replace('/', '%2F');
					request('http://' + that.ip + ':' + that.webAPIPort + '/goform/formiPhoneAppDirect.xml?SI' + inputName, function(error, response, body) {
						if(error) {
							that.log("Error while switching input %s", error);
							callback(error);
						} else {
							that.connected = true;
							callback();
						}
					});
			} else {
				that.connected = false;
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

	getDevInfoSet() {
		return this.devInfoSet;
	}
	setDevInfoSet(set) {
		this.devInfoSet = set;
	}
	hasManualPort() {
		return this.usesManualPort;
	}
	returnPort() {
		return this.webAPIPort;
	}
	returnIP() {
		return this.ip;
	}

	/*****************************************
	 * End of legacy service 
	 ****************************************/
}


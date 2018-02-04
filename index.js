var Service, Characteristic;
var Denon = require('denon-client');

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerAccessory('homebridge-denon-client', 'DenonClient', denonClient);
};

function denonClient(log, config) {
  this.log = log;

  // configuration
  this.config = config;
  this.name = config['name'];
  this.ip = config['ip'];
  this.zone = config['zone'] || 1;
  // TODO not yet working
  this.defaultVolume = config['defaultVolume'] || false;
  this.defaultInput = config['defaultInput'] || false;
  this.debug = config['debug'] || false;


  this.avr = new Denon.DenonClient(this.ip);
  this.avr.connect();
  this.state = false;

  // state variables
  this.volume = 0;
  this.power = "OFF";
  this.input = "N/A";
  this.mute = false;

  // listeners
  if (this.zone == 1) {
    this.avr.on('masterVolumeChanged', (volume) => {
      this.volume = volume;
      console.log(`Volume changed to: ${volume}`);
    });
    this.avr.on('zone1Changed', (power) => {
      this.power = power;
      console.log(`Zone1 changed to: ${power}`);
    });
    this.avr.on('inputChanged', (input) => {
      this.input = input;
      console.log(`Input changed to: ${input}`);
    });
    this.avr.on('muteChanged', (mute) => {
      this.mute = {mute};
      console.log(`mute changed to: ${mute}`);
    });
  }
  else {
    this.avr.on('zone2Changed', (power) => {
      this.power = power;
      console.log(`Zone2 changed : ${power}`);
    });
  }
}

denonClient.prototype.getPowerState = function (callback, context) {
  this.log('getPowerState Zone: %d Power: %s', this.zone, this.power);
  callback(null,  (this.power == 'ON'));
};

denonClient.prototype.setPowerState = function (powerState, callback, context) {
  this.log('setPowerState Zone: %d to:  %s', this.zone, powerState);
  if (this.zone == 1) {
  this.avr.setZone1((powerState) ? 'ON' : 'OFF')
    .then(() => {
      if(powerState && this.defaultInput) {
        this.log('setting defaultInput Zone: %d to: %s', this.zone, this.defaultInput);
        return this.avr.setInput(this.defaultInput);
      }
    });
  }
  else {
    this.avr.setZone2((powerState) ? 'ON' : 'OFF')
    .then(() => {
      if(powerState && this.defaultInput) {
        this.log('setting defaultInput Zone: %d to: %s', this.zone, this.defaultInput);
        return this.avr.setZone2(this.defaultInput);
      }
    });
  }

  // TODO: for some reason always sets volume to 0
  // .then(() => {
  //   if (powerState && this.defaultVolume) {
  //     this.log('setting defaultVolume: %d', this.defaultVolume);
  //     return this.avr.setVolume(parseInt(this.defaultVolume));
  //   }
  // });
  callback(null);
};

denonClient.prototype.getVolume = function (callback) {
  this.log('getVolume: %d', this.volume);
  callback(null, this.volume);
};

denonClient.prototype.setVolume = function (pVol, callback) {
  this.avr.setVolume(pVol);
  callback(null);
};

denonClient.prototype.setMuteState = function (state, callback) {
  this.log('setMuteState: %s', state);
  this.avr.setMute((state) ? 'ON' : 'OFF');
  callback(null);
};

denonClient.prototype.getMuteState = function (callback) {
  this.log('getMuteState: %s', this.mute);
  callback(null, this.mute);
};

denonClient.prototype.getServices = function () {
  var informationService = new Service.AccessoryInformation();

  informationService
    .setCharacteristic(Characteristic.Name, this.name)
    .setCharacteristic(Characteristic.Manufacturer, this.type || 'denon');

  // TODO Fan for now
  this.homebridgeService = new Service.Fan(this.name);
  this.homebridgeService.getCharacteristic(Characteristic.On)
    .on('get', this.getPowerState.bind(this))
    .on('set', this.setPowerState.bind(this));

  // this.homebridgeService.addCharacteristic(Characteristic.Volume)
  this.homebridgeService.addCharacteristic(Characteristic.RotationSpeed)
    .on('get', this.getVolume.bind(this))
    .on('set', this.setVolume.bind(this));

  // this.homebridgeService.addCharacteristic(Characteristic.Mute)
  this.homebridgeService.addCharacteristic(Characteristic.RotationDirection)
    .on('get', this.getMuteState.bind(this))
    .on('set', this.setMuteState.bind(this));

  return [informationService, this.homebridgeService];
};

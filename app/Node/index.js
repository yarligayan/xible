const EventEmitter = require('events').EventEmitter;
const debug = require('debug');
const nodeDebug = debug('xible:node');
const fs = require('fs');
const path = require('path');
let express;

module.exports = function(XIBLE, EXPRESS_APP) {

	class Node extends EventEmitter {

		constructor(obj) {

			super();

			this.name = obj.name;
			this.type = obj.type; //object, action, trigger (event)
			this.level = obj.level;
			this.description = obj.description;
			this.nodeExists = true; //indicates whether this is an existing installed Node
			this.hostsEditorContent = obj.hostsEditorContent; //indicates whether it has a ./editor/index.htm file
			this.top = obj.top || 0;
			this.left = obj.left || 0;
			this.data = obj.data || {};
			this.flow = null;
			this._id = obj._id;

			this._states = {};

			//init inputs
			this.inputs = {};
			if (obj.inputs) {
				for (let name in obj.inputs) {
					this.addInput(name, obj.inputs[name]);
				}
			}

			//init outputs
			this.outputs = {};
			if (obj.outputs) {
				for (let name in obj.outputs) {
					this.addOutput(name, obj.outputs[name]);
				}
			}

			//vault
			if (this._id) {

				this.vault = new NodeVault(this);

				//add vault data to the data field
				Object.assign(this.data, this.vault.get());

			}

			//construct
			if (XIBLE.child && obj.constructorFunction) {

				this.constructorFunction = obj.constructorFunction;
				this.constructorFunction.call(this, this);

			}

		}

		toJSON() {

			const ignore = ['domain', '_events', '_eventsCount', '_maxListeners', 'flow', '_states', 'vault'];
			let jsonObj = {};
			for (const key in this) {
				if (!this.hasOwnProperty(key) || ignore.indexOf(key) > -1) {
					continue;
				}
				jsonObj[key] = this[key];
			}
			return jsonObj;

		}

		static getFiles(structuresPath) {

			try {
				return fs.readdirSync(structuresPath);
			} catch (err) {

				nodeDebug(`could not readdir "${structuresPath}": ${err}`);
				return [];

			}

		}

		static getStructures(structuresPath) {

			return new Promise((resolve, reject) => {

				let files = this.getFiles(structuresPath);
				let structures = {};
				let loadedCounter = 0;

				if (!files.length) {
					resolve(structures);
				}

				function checkAndResolve() {

					if (++loadedCounter === files.length) {
						resolve(structures);
					}

				}

				for (let i = 0; i < files.length; ++i) {

					if (files[i] === 'node_modules' || files[i].substring(0, 1) === '.') {

						checkAndResolve();
						continue;

					}

					let normalizedPath = path.resolve(structuresPath, files[i]);
					fs.stat(normalizedPath, (err, stat) => { /* jshint ignore: line*/

						if (err) {

							nodeDebug(`Could not stat "${normalizedPath}": ${err}`);
							return checkAndResolve();

						}

						if (!stat.isDirectory()) {
							return checkAndResolve();
						}

						this.getStructure(normalizedPath)
							.then((structure) => {

								structures[structure.name] = structure;
								checkAndResolve();

							}).catch((err) => {

								//process subdirs instead
								this.getStructures(normalizedPath)
									.then((nestedStructures) => {

										if (!Object.keys(nestedStructures).length) {

											nodeDebug(err);
											return checkAndResolve();

										}

										Object.assign(structures, nestedStructures);
										checkAndResolve();

									});

							});

					});

				}

			});

		}

		static getStructure(filepath) {

			return new Promise((resolve, reject) => {

				let structure;

				//check for structure.json
				fs.access(`${filepath}/structure.json`, fs.constants.R_OK, (err) => {

					if (err) {
						return reject(`Could not access "${filepath}/structure.json": ${err}`);
					}

					try {

						structure = require(`${filepath}/structure.json`);
						structure.path = filepath;

					} catch (err) {
						return reject(`Could not require "${filepath}/structure.json": ${err}`);
					}

					//check for editor contents
					fs.stat(`${filepath}/editor`, (err, stat) => {

						if (err) {
							return resolve(structure);
						}

						if (stat.isDirectory()) {
							structure.editorContentPath = `${filepath}/editor`;
						}

						return resolve(structure);

					});

				});

			});

		}

		/**
		 * Initializes all nodes found in a certain path, recursively, by running getStructures() on that path
		 * @param {String} nodePath Path to the directory containting the nodes. If the directory does not exist, it will be created.
		 * @private
		 */
		static initFromPath(nodePath) {

			nodeDebug(`init nodes from "${nodePath}"`);

			//check that nodePath exists
			if (!fs.existsSync(nodePath)) {

				nodeDebug(`creating "${nodePath}"`);
				fs.mkdirSync(nodePath);

			}

			if (!XIBLE.child && !express) {
				express = require('express');
			}

			return this.getStructures(nodePath).then((structures) => {

				for (let nodeName in structures) {

					let structure = structures[nodeName];
					XIBLE.addNode(nodeName, structure);

					//host editor contents if applicable
					if (structure.editorContentPath && !XIBLE.child) {

						structure.hostsEditorContent = true;

						nodeDebug(`hosting "/api/nodes/${nodeName}/editor"`);
						EXPRESS_APP.use(`/api/nodes/${nodeName}/editor`, express.static(structure.editorContentPath, {
							index: false
						}));

					}

				}

			});

		}

		/**
		 * Adds a {NodeInput} to the node.
		 * @param {String} name Name of the input.
		 * @param {NodeInput} input Input to add.
		 * @returns {NodeInput} Added input, which equals the given input.
		 */
		addInput(name, input) {

			if (!(input instanceof NodeInput)) {
				input = new NodeInput(input);
			}

			input.name = name;
			input.node = this;
			this.inputs[name] = input;

			return input;

		}

		/**
		 * Adds a {NodeOutput} to the node.
		 * @param {String} name Name of the output.
		 * @param {NodeOutput} output Output to add.
		 * @returns {NodeOutput} Added output, which equals the given output.
		 */
		addOutput(name, output) {

			if (!(output instanceof NodeOutput)) {
				output = new NodeOutput(output);
			}

			output.name = name;
			output.node = this;
			this.outputs[name] = output;

			return output;

		}

		/**
		 * Returns all inputs attached to this node.
		 * @returns {NodeInput[]} List of inputs.
		 */
		getInputs() {

			let inputs = [];
			for (let name in this.inputs) {
				inputs.push(this.inputs[name]);
			}
			return inputs;

		}

		/**
		 * Returns all outputs attached to this node.
		 * @returns {NodeOutput[]} List of outputs.
		 */
		getOutputs() {

			let outputs = [];
			for (let name in this.outputs) {
				outputs.push(this.outputs[name]);
			}
			return outputs;

		}

		/**
		 * Returns an input by the given name, or null if it does not exist.
		 * @param {String} name Name of the input.
		 * @returns {NodeInput|null} An input, or null if not found.
		 */
		getInputByName(name) {
			return this.inputs[name];
		}

		/**
		 * Returns an output by the given name, or null if it does not exist.
		 * @param {String} name Name of the output.
		 * @returns {NodeOutput|null} An output, or null if not found.
		 */
		getOutputByName(name) {
			return this.outputs[name];
		}

		/**
		 * Adds a progress bar to the node, visible in the editor.
		 * @param {Object} status
		 * @param {String} [status.message] A text message representing the context of the progress bar.
		 * @param {Number} [status.percentage=0] The starting point of the progress bar as a percentage. Value can range from 0 to (including) 100.
		 * @param {Number} [status.updateOverTime] Specifies the time in milliseconds to automatically update the progress bar to 100% from the given percentage value.
		 * @param {Number} [status.timeout] Timeout in milliseconds after which the progress bar disappears.
		 * @returns {Number} Returns an identifier as Number, which can be used to update the status of the progress bar through node.updateProgressBarById, or remove the progress bar through removeProgressBarById.
		 */
		addProgressBar(status) {

			if (!status) {
				throw new Error(`the "status" argument is required`);
			}

			status._id = XIBLE.generateObjectId();

			if (!status.startDate) {
				status.startDate = Date.now();
			}

			this.sendProcessMessage({
				method: "broadcastWebSocket",
				message: {

					method: "xible.node.addProgressBar",
					nodeId: this._id,
					flowId: this.flow._id,
					status: status

				}

			});

			return status._id;

		}


		sendProcessMessage(obj) {

			if (process.connected) {
				process.send(obj);
			}

		}

		/**
		 * Updates the status on an existing progress bar.
		 * @param {Number} statusId The identifier of the existing progress bar, as returned by addProgressBar().
		 * @param {Object} status
		 * @param {Number} status.percentage The point of the progress bar as a percentage. Value can range from 0 to (including) 100.
		 * @returns {Number} Returns the given statusId.
		 */
		updateProgressBarById(statusId, status) {

			if (!statusId || !status) {
				throw new Error(`the "statusId" and "status" arguments are required`);
			}

			this.sendProcessMessage({
				method: "broadcastWebSocket",
				message: {

					method: "xible.node.updateProgressBarById",
					nodeId: this._id,
					flowId: this.flow._id,
					status: {
						_id: statusId,
						percentage: status.percentage
					}

				}
			});

			return statusId;

		}


		updateStatusById(statusId, status) {

			if (!statusId || !status) {
				throw new Error(`the "statusId" and "status" arguments are required`);
			}

			this.sendProcessMessage({
				method: "broadcastWebSocket",
				message: {

					method: "xible.node.updateStatusById",
					nodeId: this._id,
					flowId: this.flow._id,
					status: {
						_id: statusId,
						message: status.message,
						color: status.color
					}

				}
			});

			return statusId;

		}


		addStatus(status) {

			if (!status) {
				throw new Error(`the "status" argument is required`);
			}

			status._id = XIBLE.generateObjectId();

			this.sendProcessMessage({
				method: "broadcastWebSocket",
				message: {

					method: "xible.node.addStatus",
					nodeId: this._id,
					flowId: this.flow._id,
					status: status

				}
			});

			return status._id;

		}

		removeProgressBarById() {
			this.removeStatusById(...arguments);
		}


		removeStatusById(statusId, timeout) {

			if (!statusId) {
				throw new Error(`the "statusId" argument is required`);
			}

			this.sendProcessMessage({
				method: "broadcastWebSocket",
				message: {

					method: "xible.node.removeStatusById",
					nodeId: this._id,
					flowId: this.flow._id,
					status: {
						_id: statusId,
						timeout: timeout
					}

				}
			});

		}


		removeAllStatuses() {

			this.sendProcessMessage({
				method: "broadcastWebSocket",
				message: {

					method: "xible.node.removeAllStatuses",
					nodeId: this._id,
					flowId: this.flow._id

				}
			});

		}


		setTracker(status) {

			if (!status) {
				throw new Error(`the "status" argument is required`);
			}

			this.sendProcessMessage({
				method: "broadcastWebSocket",
				message: {

					method: "xible.node.setTracker",
					nodeId: this._id,
					flowId: this.flow._id,
					status: status

				}
			});

		}

		fail(err, state) {

			console.warn('Node.fail() is deprecated. Use Node.error() instead');

			if (typeof err !== 'string') {
				throw new Error(`"err" argument of Node.error(state, err) must be of type "string"`);
			}

			this.error(err, state);

		}

		error(err, state) {

			if (!(state instanceof XIBLE.FlowState) && !(err.state instanceof XIBLE.FlowState)) {
				throw new Error(`state should be provided and instance of FlowState`);
			}

			if (!(err instanceof Error)) {
				err = new Error('' + err);
			}

			if (state) {
				err.state = state;
			}
			err.node = this;

			this.setTracker({
				message: err.message,
				color: 'red',
				timeout: 7000
			});

			if (this.flow) {
				this.flow.emit('error', err);
			}

		}

		/**
		 * Confirms whether the node has any inputs of the given type.
		 * @param {String|null} type The type you want to check. Null would by 'any' type.
		 * @returns {Boolean} Returns a Boolean; true or false.
		 */
		hasConnectedInputsOfType(type) {
			return this.inputs.some(input => input.type === type && input.connectors.length);
		}

		static flowStateCheck(state) {

			if (!(state instanceof XIBLE.FlowState)) {
				throw new Error(`state should be provided and instance of FlowState`);
			}

			return true;

		}

	}


	class NodeIo extends EventEmitter {

		constructor(obj) {

			super();

			this.name = null;
			this.type = null;
			this.singleType = false;
			this.maxConnectors = null;
			this.node = null;
			this.description = null;

			if (obj) {

				if (typeof obj.type === 'string') {

					if (obj.type === 'global') {
						throw new TypeError(`you cannot define a input or output with type 'global'`);
					}

					this.type = obj.type;

				}

				if (typeof obj.singleType === 'boolean') {
					this.singleType = obj.singleType;
				}

				if (typeof obj.maxConnectors === 'number') {
					this.maxConnectors = obj.maxConnectors;
				}

				if (typeof obj.global === 'boolean') {
					this.global = obj.global;
				}

				if (typeof obj.description === 'string') {
					this.description = obj.description;
				}

			}

			this.connectors = [];

		}

		toJSON() {

			const ignore = ['domain', '_events', '_eventsCount', '_maxListeners', 'node', 'connectors'];
			let jsonObj = {};
			for (const key in this) {
				if (!this.hasOwnProperty(key) || ignore.indexOf(key) > -1) {
					continue;
				}
				jsonObj[key] = this[key];
			}
			return jsonObj;

		}

		isConnected() {

			let conns = this.connectors;

			//check global outputs
			if (!conns.length && this.global && this.node && this.node.flow) {
				conns = this.node.flow.getGlobalOutputsByType(this.type);
			}

			if (conns.length) {
				return true;
			}

			return false;

		}

	}


	class NodeInput extends NodeIo {

		constructor() {
			super(...arguments);
		}

		getValues(state) {

			Node.flowStateCheck(state);

			return new Promise((resolve, reject) => {

				let conns = this.connectors;

				//add global outputs as a dummy connector to the connector list
				if (!conns.length && this.global) {

					conns = this.node.flow.getGlobalOutputsByType(this.type).map((output) => ({
						origin: output
					}));

				}

				let connLength = conns.length;
				if (!connLength) {

					resolve([]);
					return;

				}

				let values = [];
				let callbacksReceived = 0;
				for (let i = 0; i < connLength; i++) {

					let conn = conns[i];

					//trigger the input
					conn.origin.emit('trigger', conn, state, (value) => { /* jshint ignore: line */

						//let everyone know that the trigger is done
						conn.origin.emit('triggerdone');

						//we only send arrays between nodes
						//we don't add non existant values
						//we concat everything
						if (typeof value !== 'undefined' && !Array.isArray(value)) {
							value = [value];
						}
						if (typeof value !== 'undefined') {
							values = values.concat(value);
						}

						//all done
						if (++callbacksReceived === connLength) {
							resolve(values);
						}

					});

				}

			});

		}

	}

	class NodeOutput extends NodeIo {

		constructor() {
			super(...arguments);
		}

		trigger(state) {

			Node.flowStateCheck(state);

			this.node.emit('triggerout', this);

			let conns = this.connectors;
			for (let i = 0; i < conns.length; i++) {

				let conn = conns[i];
				conn.destination.node.emit('trigger');
				conn.destination.emit('trigger', conn, state.split());

			}

		}

	}

	if (EXPRESS_APP) {
		require('./routes.js')(Node, XIBLE, EXPRESS_APP);
	}

	//TODO: encryption on the vault
	const vaultDebug = debug('xible:vault');
	let vault;
	let vaultPath = XIBLE.Config.getValue('vault.path');
	if (!vaultPath) {
		throw new Error(`no "vault.path" configured`);
	}
	vaultPath = XIBLE.resolvePath(vaultPath);

	class MainVault {

		static init() {

			//create the vault if it doesn't exist
			if (!fs.existsSync(vaultPath)) {

				vaultDebug(`creating new`);
				fs.writeFileSync(vaultPath, '{}');

			}

			try {
				vault = JSON.parse(fs.readFileSync(vaultPath));
			} catch (err) {
				vaultDebug(`could not open "${vaultPath}"`);
			}

		}

		static save() {

			try {
				fs.writeFileSync(vaultPath, JSON.stringify(vault));
			} catch (e) {
				vaultDebug(`could not save "${vaultPath}"`);
			}

		}

		static get(node) {

			if (!node || !node._id) {
				return;
			}

			if (!vault) {
				this.init();
			}

			return vault[node._id];

		}

		static set(node, obj) {

			if (!node || !node._id) {
				return;
			}

			//always get fresh contents
			this.init();

			vault[node._id] = obj;
			this.save();

		}

	}

	class NodeVault {

		constructor(node) {
			this.node = node;
		}

		set(obj) {

			//also update the data property on the node
			Object.assign(this.node.data, obj);
			return MainVault.set(this.node, obj);

		}

		get() {
			return MainVault.get(this.node);
		}

	}

	return {
		Node: Node,
		NodeInput: NodeInput,
		NodeOutput: NodeOutput
	};

};

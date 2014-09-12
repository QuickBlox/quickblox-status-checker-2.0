'use strict';

var QB       	= require("quickblox"),
	request		= require("request"),
	moment 		= require("moment"),
	config	 	= require("./config"),
	chance      = require("chance").Chance(),
	colors		= require("colors"),
	ChatUser	= require("./chat"),
	memwatch	= require("memwatch");
	
require('nodetime').profile({
	accountKey: '',
	appName: 'Status checker runner'
});

memwatch.on('leak', function(leak) {
	console.log("Leak detected.");
	console.log(leak);
});

var testingInstance = false,
	chatCredentials = {},
	instances = config.instances,
	status_app = config.status_app,
	LOG_CHECKS = true;

var latency = { total: {} },
	current_instance = 0,
	error_log = {},
	misc = {},
	testingCallback; // Will be a function if testingInstance===true


// This is a map of all the functions to complete.
// I just thought it was cleaner than referencing
// the next function in each checker.
var order = {
    first:                  createSession,
	create_session: 		createUser,
	create_user: 			createUserSession,
	create_user_session: 	listUsers,
	list_users: 			updateUser,
	update_user:            deleteUser,
	delete_user:            destroySession,
	destroy_session:        createNewSession,
	create_new_session:     createGeodata,
	create_geodata:         createPlace,
	create_place:           deletePlace,
	delete_place:           createContent,
	create_content:			listContent,
	list_content:			deleteContent,
	delete_content:			createData,
	create_data:            updateData,
	update_data:            listData,
	list_data:              deleteData,
	delete_data:            createPush,
	create_push:            deletePush,
	delete_push:            createDialog,
	create_dialog:			privateChat,
	private_chat:			groupChat,
	group_chat:				retrieveDialogs,
	retrieve_dialogs:		removeDialogOccupant,
	remove_dialog_occupant:	addDialogOccupant,
	add_dialog_occupant:	end
};


function start(instance, callback) { // instance will be passed if we are doing a test case
	if(!instance) {
		var current = current_instance,
			app_id = instances[current].app_id,
			auth_key = instances[current].auth_key,
			auth_secret = instances[current].auth_secret,
			endpoint = instances[current].endpoint;
		
		QB.init(app_id, auth_key, auth_secret, false);
		QB.service.qbInst.config.endpoints.api = endpoint;
		order.first();
	} else {
		testingInstance = true;
		var config = instance.credentials;
		QB.init(config.app_id, config.auth_key, config.auth_secret, false);
		QB.service.qbInst.config.endpoints.api = config.endpoint;
		testingCallback = callback;
	}
}

function startTime() {
	return Date.now();
}

function getLatency(ts) {
	var now = Date.now();
	return now-ts;
}

function failed(module, error) {
    var instance = thisInstance("name");
    var errormsg = {module: module, details: error};
    	
	if(typeof error_log[instance] === "undefined") {
    	error_log[instance] = [];
    	error_log[instance].push(errormsg);
	} else {
    	error_log[instance].push(errormsg);
	}
	
	timeTo(module, 0);
	next(module);
}

function moduleDisabled(module) {
    var instance = thisInstance("name");
	timeTo(module, -1);
	next(module);
}

function getErrorLog(return_type) {
	if(return_type === "json") {
		return JSON.stringify(error_log);
	} else if (return_type === "length") {
		return Object.keys(error_log).length;
	} else {
		return error_log;
	}
}

function next(name) {
    name = name.toLowerCase().replace(/ /g, '_');
	order[name]();
}

function end() {
	if(!testingInstance) {

		var time = moment().format("DD/MM/YY HH:mm:ss"),
			instanceName = thisInstance("name");
		
		if(current_instance+1 === instances.length ) {
			
			var whole_total = 0;
			for(var fig in latency.total) {
				whole_total += latency.total[fig];
			}
			
			console.log(time + " [" + instanceName + "] Completed checks ("+ latency.total[instanceName] + "ms)")
			console.log("Completed all checks in " + whole_total + "ms");
					
			if(getErrorLog("length") === 1) {
				console.log("There was 1 error while checking.");
				console.log(getErrorLog("json"));
			} else {
				console.log("There were " + getErrorLog("length") + " errors while checking.");
				if(getErrorLog("length") > 0) {
					console.log(getErrorLog("json"));
				}
			}
					
			submitLogs(function() {
	    		setTimeout(function() {
	        		reset();
	        		return;
	    		}, 5000)
			});
			
		} else {
		    console.log(time + " [" + instanceName + "] Completed checks ("+ latency.total[instanceName] + "ms)");
			current_instance++;
			misc = {};
			start();
		}
	} else { // We are testing just one instance
		testingInstance = false;
		testingCallback(latency);
		reset();
	}
}

function submitLogs(callback) {
	QB.init(status_app.app_id, status_app.auth_key, status_app.auth_secret, false);
	QB.service.qbInst.config.endpoints.api = status_app.endpoint;
	QB.createSession({login: "logbot", password: "logbot00"}, function(error, response){
	    if(!error) {
	        
	        var currentLogsInstance = 0,
	        	numberOfInstances = instances.length,
	        	sendLogs;
	        
	        sendLogs = function() {
		        var errors = null;
                if(error_log[instances[currentLogsInstance].name] !== "undefined" && error_log[instances[currentLogsInstance].name] !== null)
                errors = JSON.stringify(error_log[instances[currentLogsInstance].name]);
                
                var log = {
                    logs: JSON.stringify(latency[instances[currentLogsInstance].name]),
                    errors: errors,
                    total_latency: latency.total[instances[currentLogsInstance].name],
                    hours: moment().format("HH"),
                    minutes: moment().format("mm")
                }
                
                QB.data.create(instances[currentLogsInstance].name, log, function(error,response){
                    if (!error) {
                    	console.log("Sent logs for " + instances[currentLogsInstance].name);
                        currentLogsInstance++;
                        if( currentLogsInstance === numberOfInstances) {
                            console.log("Sent all logs (x"+currentLogsInstance+")");
                            callback();
                            return;
                        } else {
							sendLogs();
							return;
						}
                    } else {
	                    setTimeout(function() {
		                    sendLogs();
		                    return;
	                    }, 5000)
                    }
                });
                
	        };
	        
	        sendLogs();

	    } else {
    	    console.log("Could not create new session. Will try again in 10 seconds.");
    	    setTimeout(function() {submitLogs()}, 10000)    	    
	    }
	});
}

function thisInstance(item) {
	if(!testingInstance) return (typeof item !== "undefined" ? instances[current_instance][item] : instances[current_instance]);
	else return (typeof item !== "undefined" ? testingInstance[item] : instances[current_instance]);
}

function reset() {
    latency = {};
	current_instance = 0;
	error_log = {};
	latency.total = {};
	chatCredentials = {};
	testingCallback = null;
	Object.keys(misc).forEach(function(key) {
		delete misc[key];
	})
	misc = {};
}

function timeTo(stat, time) {
	
	var instanceName = thisInstance("name"),
		time_now = moment().format("DD/MM/YY HH:mm:ss.SSS");
	
	if (time > 0) {
		if(LOG_CHECKS) console.log(time_now.bold.blue + (" [" + instanceName + "] " + stat.toLowerCase() + " ("+ time + "ms)").yellow);
	} else if (time === -1) {
		if(LOG_CHECKS) console.log(time_now.bold.blue + (" [" + instanceName + "] " + stat.toLowerCase() + " (disabled)").yellow);
	} else {
		if(LOG_CHECKS) console.log(time_now.bold.blue + (" [" + instanceName + "] " + stat.toLowerCase() + " (failed)").yellow);
	}
	
	stat = stat.toLowerCase().replace(/ /g, '_');
	
	// If no records of the latency have been made before, create the key in the latency object
	if(typeof latency[instanceName] === "undefined") latency[instanceName] = {};
	
	// Add the time to the latency.instance object
	latency[instanceName][stat] = time;
	
	// If the "total" key hasn't been created, do it. The total is incremented on each timeTo()
	if(typeof latency.total[instanceName] === "undefined") {
		latency.total[instanceName] = 0;
	}
	
	// Increment the time
	latency.total[instanceName] += time;
}

function newName() {
    return chance.name().replace(/ /g, '_');
}

function getTemp(module, field) {
	if(module && !field && misc[module]) {
		return misc[module];
	} else if (module && field && misc[module]) {
		if(misc[module][field]) {
			return misc[module][field]
		} else {
			return null;
		}
	} else {
		return null;
	}
}

function setTemp(module, record) {
	if(!module || !record) {
		return misc = {};
	} else {
		misc[module] = record;
	}
}

function createSession() {
	var my = {
		begin: startTime(),
		name: "Create session" };

	QB.createSession(function(error, response){
	    if(error) {
	        failed(my.name, error);
	        my = null;
	    } else {
	        timeTo(my.name, getLatency(my.begin));
	        next(my.name);
	        my = null;
	    }
	});
}

function createUser() {
	var my = {
		begin: startTime(),
		name: "Create user",
		module: "user" };
	
	QB.users.create({ full_name: chance.name(), login: newName(), password: "password1234" }, function(error, response){
	    if(error) {
	        failed(my.name, error);
	        my = null;
	    } else {
	        timeTo(my.name, getLatency(my.begin));
	        setTemp(my.module, response);
	        next(my.name);
	        my = null;
	    }
	});
}

function createUserSession() {
	var my = {
		begin: startTime(),
		name: "Create user session",
		module: "user" };
	
	QB.createSession({ login: getTemp(my.module, "login"), password: "password1234" }, function(error, response){
	    if(error) {
	        failed(my.name, error);
	        my = null;
	    } else {
	        timeTo(my.name, getLatency(my.begin));
	        next(my.name);
	        my = null;
	    }
	});
}

function listUsers() {
	var my = {
		begin: startTime(),
		name: "List users" };
	
	QB.users.listUsers(function(error, response){
	    if(error) {
	        failed(my.name, error);
	        my = null;
	    } else {
	        timeTo(my.name, getLatency(my.begin));
	        next(my.name);
	        my = null;
	    }
	});
}

function updateUser() {
	var my = {
		begin: startTime(),
		name: "Update user",
		module: "user" };
	
	QB.users.update( getTemp(my.module, "id"), { website: chance.domain() }, function(error, response){
	    if(error) {
	        failed(my.name, error);
	        my = null;
	    } else {
	        timeTo(my.name, getLatency(my.begin));
	        next(my.name);
	        my = null;
	    }
	});
}

function deleteUser() {
	var my = {
		begin: startTime(),
		name: "Delete user",
		module: "user" };
	
	QB.users.delete( getTemp(my.module, "id"), function(error, response){
	    if(error) {
	        failed(my.name, error);
	        my = null;
	    } else {
	        timeTo(my.name, getLatency(my.begin));
	        next(my.name);
	        my = null;
	    }
	});
}

function destroySession() {
    var my = {
		begin: startTime(),
		name: "Destroy session" };
    
    QB.destroySession(function(error, response){
	    if(error) {
	        failed(my.name, error);
	        my = null;
	    } else {
	        timeTo(my.name, getLatency(my.begin));
	        next(my.name);
	        my = null;
	    }
	});
}

function createNewSession() {
    var my = {
		begin: startTime(),
		name: "Create new session" };
    
    QB.createSession(config.masterLogin, function(error, response){
	    if(error) {
	        failed(my.name, error);
	        my = null;
	    } else {
	    	setTemp("session", { token: response.token });
	        next(my.name);
	        my = null;
	    }
	});
}

function createGeodata() {
	var my = {
		begin: startTime(),
		name: "Create geodata",
		module: "geodata" };
	
	QB.location.geodata.create({ latitude: chance.latitude(), longitude: chance.longitude() }, function(error, response){
	    if(error) {
	        failed(my.name, error);
	        my = null;
	    } else {
	        timeTo(my.name, getLatency(my.begin));
	        setTemp(my.module, response);
	        next(my.name);
	        my = null;
	    }
	});
}

function createPlace() {
	var my = {
		begin: startTime(),
		name: "Create place",
		module: "place" };
	
	QB.location.places.create({ geo_data_id: getTemp("geodata", "id"), title: chance.street(), address: chance.address()}, function(error, response){
	    if(error) {
	        failed(my.name, error);
	        my = null;
	    } else {
	        timeTo(my.name, getLatency(my.begin));
	        setTemp(my.module, response.place);
	        next(my.name);
	        my = null;
	    }
	});
}

function deletePlace() {
	var my = {
		begin: startTime(),
		name: "Delete place",
		module: "place" };
	
	QB.location.places.delete( getTemp(my.module, "id"), function(error, response){
	    if(error) {
	        failed(my.name, error);
	        my = null;
	    } else {
	        timeTo(my.name, getLatency(my.begin));
	        next(my.name);
	        my = null;
	    }
	});
}

function createContent() {
	var my = {
		begin: startTime(),
		name: "Create content",
		module: "content" };
	
	QB.content.create({ name: chance.capitalize(chance.word()), content_type: "image/png", 'public': true }, function(error, response){
	    if(error) {
	        failed(my.name, error);
	        my = null;
	    } else {
	        timeTo(my.name, getLatency(my.begin));
	        setTemp(my.module, response);
	        next(my.name);
	        my = null;
	    }
	});
}

function listContent() {
	var my = {
		begin: startTime(),
		name: "List content",
		module: "content" };
	
	QB.content.list(function(error, response){
	    if(error) {
	        failed(my.name, error);
	        my = null;
	    } else {
	        timeTo(my.name, getLatency(my.begin));
	        next(my.name);
	        my = null;
	    }
	});
}

function deleteContent() {
	var my = {
		begin: startTime(),
		name: "Delete content",
		module: "content" };
	
	QB.content.delete( getTemp(my.module, "id"), function(error, response){
	    if(error) {
	        failed(my.name, error);
	        my = null;
	    } else {
	        timeTo(my.name, getLatency(my.begin));
	        next(my.name);
	        my = null;
	    }
	});
}

function createData() {
	var my = {
		begin: startTime(),
		name: "Create data",
		module: "data" };
	
	QB.data.create(config.testingTable, { Hello: chance.sentence() }, function(error, response){
	    if(error) {
	        failed(my.name, error);
	        my = null;
	    } else {
	        timeTo(my.name, getLatency(my.begin));
	        setTemp(my.module, response);
	        next(my.name);
	        my = null;
	    }
	});
}

function updateData() {
	var my = {
		begin: startTime(),
		name: "Update data",
		module: "data" };
		
	QB.data.update(config.testingTable, { _id: getTemp(my.module, "_id"), Hello: chance.sentence() }, function(error, response){
	    if(error) {
	        failed(my.name, error);
	        my = null;
	    } else {
	        timeTo(my.name, getLatency(my.begin));
	        next(my.name);
	        my = null;
	    }
	});
}

function listData() {
	var my = {
		begin: startTime(),
		name: "List data" };
	
	QB.data.list(config.testingTable, function(error, response){
	    if(error) {
	        failed(my.name, error);
	        my = null;
	    } else {
	        timeTo(my.name, getLatency(my.begin));
	        next(my.name);
	        my = null;
	    }
	});
}

function deleteData() {
	var my = {
		begin: startTime(),
		name: "Delete data",
		module: "data" };
	
	QB.data.delete(config.testingTable, getTemp(my.module, "_id"), function(error, response){
	    if(error) {
	        failed(my.name, error);
	        my = null;
	    } else {
	        timeTo(my.name, getLatency(my.begin));
	        next(my.name);
	        my = null;
	    }
	});
}

function createPush() {
	var my = {
		begin: startTime(),
		name: "Create push",
		module: "messages" };
		
	QB.messages.tokens.create({environment: "development", client_identification_sequence: "144", platform: "ios", udid: chance.apple_token() }, function(error, response){
	    if (error) {
	        failed(my.name, error);
	        my = null;
	    } else {
            timeTo(my.name, getLatency(my.begin));
            setTemp(my.module, response);
	        next(my.name);
	        my = null;
	    }
	});
}

function deletePush() {
	var my = {
		begin: startTime(),
		name: "Delete push",
		module: "messages" };
		
	QB.messages.tokens.delete( getTemp(my.module, "id"), function(error, response){
	    if (error) {
	        failed(my.name, error);
	        my = null;
	    } else {
            timeTo(my.name, getLatency(my.begin));
	        next(my.name);
	        my = null;
	    }
	});
}

function createDialog() {
	var my = {
		begin: 0,
		name: "Create dialog",
		module: "chat" };
	
	if(thisInstance("chat_enabled") === false || thisInstance("chat_v2") === false) {
		moduleDisabled(my.name);
	} else {
		
		var chat_users = config.xmpp[thisInstance("name")],
			endpoint = thisInstance("endpoint");
		
		var options = {
			url: "https://" + endpoint + "/chat/Dialog.json",
			headers: {
				"QB-Token": getTemp("session", "token")
			},
			json: {
				occupants_ids: [chat_users.sender.jid.split("-")[0], chat_users.recipient.jid.split("-")[0]].toString(),
				name: "Developer Chat (" + moment().format("DD-MM-YY") + ") - " + chance.natural({min: 1, max: 999999}),
				type: 2
			}
		};
		
		console.log("setting headers on request to " + options.url); // Just for logs to fit in with the other modules :(
		my.begin = startTime();
		
		request.post(options, function(error, response, body) {
			if(!error && typeof body.xmpp_room_jid !== "undefined") {
				setTemp(my.module, body);
				timeTo(my.name, getLatency(my.begin));
				next(my.name);
			} else {
				if(error === null || typeof error === "undefined" && response.body && response.body.errors) { error=JSON.stringify(response.body.errors); };
				setTemp(my.module, -1);
				failed(my.name, error.toString());
			}
		});
	}
}

function privateChat() {
	var my = {
		latency: 0,
		name: "Private chat",
		module: "chat" },

		current_xmpp = config.xmpp[thisInstance("name")],
		message_hash = chance.hash(),
		sender, receiver, listeners, sendMessage, onChat;
	
	var isbb = (thisInstance("chat_enabled") === "BabyBundle");
	
	if(thisInstance("chat_enabled") === false) {
		moduleDisabled(my.name);
	} else {
			
		var kill = function(reason) {
			receiver.disconnect();
			sender.disconnect();
			receiver = null;
			sender = null;
			if(typeof reason !== "undefined") {
				failed(my.name, reason);
			}
		};
		
		// Timeout the whole function after 10 seconds
		my.self_destruct = setTimeout(function() {
	    	kill("Time to connect and send the message exceeded " + (config.chat_timeout / 1000) + " seconds.");
		}, config.chat_timeout);
		
		onChat = function(from, message) {
		
			var timeReceived = Date.now(),
				passed;
			
			clearTimeout(my.self_destruct);
			
			kill();
			
			if( message.indexOf(":") !== -1 ) {
				message = message.split(":");
				my.latency = timeReceived-message[1];
				
				if(message_hash === message[0]) {
					timeTo(my.name, my.latency);
					next(my.name);
				} else {
					kill("Message was received but was inconsistent. (Sent '" + message_hash + "' but received '" + stanza[0] + "')");
				}
				
			} else {
				kill("Message was completely malformed and could not be read.");
			}
		};
		
		receiver = new ChatUser({
			credentials: config.clone(current_xmpp.recipient),
			defaults: false,
			on: {chat: onChat}
		});
		
		sender = new ChatUser({
			credentials: config.clone(current_xmpp.sender),
			defaults: false,
			on: { online: function() {
					setTimeout(function() {
						sender.send({
							to: current_xmpp.recipient.jid,
							message: message_hash + ":" + Date.now()
						});
					}, 1000);
				} 
			}
		});
	}
}

function groupChat() {
	var my = {
		latency: 0,
		name: "Group chat",
		module: "chat" },

		current_xmpp = config.xmpp[thisInstance("name")],
		sender, receiver, listeners, sendMessage, onStanza, senderStanza,
		message_hash = chance.hash(),
		presence_count = 0;
	
	if( thisInstance("chat_enabled") === false || thisInstance("chat_v2") === false ) {
		moduleDisabled(my.name);
	}
	else if ( getTemp(my.module) === -1 ) { // the dialog() method will return -1 if the previous dialog creation method failed
		failed(my.name, "Could not test group chat due to dialog creation failure.");
	}
	else {
		
		var room_jid = getTemp(my.module, "xmpp_room_jid");
		
		var kill = function(reason) {
			receiver.disconnect();
			sender.disconnect();
			receiver = null;
			sender = null;
			if(typeof reason !== "undefined") {
				failed(my.name, reason);
			}
			return;
		};
		
		// Timeout the whole function after 10 seconds (well, the 10 seconds is defined in the config file)
		my.self_destruct = setTimeout(function() {
			kill("Time to connect and send the message exceeded " + (config.chat_timeout/1000) + " seconds.");
		}, config.chat_timeout);
		
		senderStanza = function(stanza) {
			if(stanza.name === "presence") {
				presence_count++;
										
				// Will receive 3 presences before it's ok to send a message otherwise it will hang until the end of time
				if(presence_count === 3) {
					sender.send({
						to: room_jid,
						message: message_hash + ":" + Date.now(),
						group: true,
						history: true
					});
				}
			}
		};
		
		onStanza = function(stanza) {
			if(stanza.name === "message") {
				var timeReceived = Date.now(),
					passed;
				
				stanza = stanza.children[0].children[0].toString();
				
				clearTimeout(my.self_destruct);
				
				if( stanza.indexOf(":") !== -1 ) {
					stanza = stanza.split(":");
					my.latency = timeReceived-stanza[1];
					
					if(message_hash === stanza[0]) {
						kill();
						timeTo(my.name, my.latency);
						next(my.name);
					} else {
						kill("Message was received but was inconsistent. (Sent '" + message_hash + "' but received '" + stanza[0] + "')");
					}
					
				} else {
					kill("Message was completely malformed and could not be read.");
				}
			}
		};
		
		receiver = new ChatUser({
			credentials: config.clone(current_xmpp.recipient),
			defaults: false,
			on: {online: function(){ receiver.join(room_jid + "/" + current_xmpp.recipient.jid.split("-")[0]); }, stanza: onStanza},
		});
		
		sender = new ChatUser({
			credentials: config.clone(current_xmpp.sender),
			defaults: false,
			on: { online: function() {sender.join(room_jid + "/" + current_xmpp.sender.jid.split("-")[0]);}, stanza: senderStanza }
		});
	}
}

function retrieveDialogs() {
	var my = {
		begin: 0,
		name: "Retrieve dialogs",
		module: "chat" };	
	
	if( thisInstance("chat_enabled") === false || thisInstance("chat_v2") === false ) {
		moduleDisabled(my.name);
	}
	else {
		
		var endpoint = thisInstance("endpoint");
		
		console.log("setting headers on request to https://" + endpoint + "/chat/Dialog.json");
	
		var options = {
			url: "https://" + endpoint + "/chat/Dialog.json",
			headers: {
				"QB-Token": getTemp("session", "token")
			},
			json: {
				limit: 1
			}
		};
		
		my.begin = startTime();
		request.get(options, function(error, response, body) {
			if(!error && typeof body.items !== "undefined") {
				timeTo(my.name, getLatency(my.begin));
				next(my.name);
			} else {
				if(error === null || typeof error === "undefined" && response.body && response.body.errors) { error=JSON.stringify(response.body.errors); };
				failed(my.name, error.toString());
			}
		});
	}
}

function removeDialogOccupant() {
	var my = {
		begin: 0,
		name: "Remove dialog occupant",
		module: "chat" };
	
	if(thisInstance("chat_enabled") === false || thisInstance("chat_v2") === false) {
		moduleDisabled(my.name);
	}
	else if (getTemp(my.module) === -1) { // the dialog() method will return -1 if the previous dialog creation method failed
		failed(my.name, "Could not '" + my.name + "' due to dialog creation failure.");
	}
	else {
		
		var	endpoint 	= thisInstance("endpoint"),
			dialog_id 	= getTemp(my.module, "_id"),
			user1		= getTemp(my.module, "occupants_ids")[0]; // ID of user to remove
				
		console.log("setting headers on request to https://" + endpoint + "/chat/Dialog.json");
	
		var options = {
			url: "https://" + endpoint + "/chat/Dialog/" + dialog_id + ".json",
			headers: {
				"QB-Token": getTemp("session", "token")
			},
			json: {
				pull_all: {
					occupants_ids: [user1]
				}
			}
		};
		
		my.begin = startTime();
		request.put(options, function(error, response, body) {
			if(!error && typeof body.xmpp_room_jid !== "undefined") {
				timeTo(my.name, getLatency(my.begin));
				next(my.name);
			} else {
				if(error === null || typeof error === "undefined" && response.body && response.body.errors) { error=JSON.stringify(response.body.errors); };
				failed(my.name, error.toString());
			}
		});
	}
}

function addDialogOccupant() {
	var my = {
		begin: 0,
		name: "Add dialog occupant",
		module: "chat" };
	
	if(thisInstance("chat_enabled") === false || thisInstance("chat_v2") === false) {
		moduleDisabled(my.name);
	}
	else if (getTemp(my.module) === -1) { // the dialog() method will return -1 if the previous dialog creation method failed
		failed(my.name, "Could not '" + my.name + "' due to dialog creation failure.");
	}
	else {
	
		var	endpoint 	= thisInstance("endpoint"),
			dialog_id 	= getTemp(my.module, "_id"),
			user1		= getTemp(my.module, "occupants_ids")[0]; // ID of user to add
				
		console.log("setting headers on request to https://" + endpoint + "/chat/Dialog.json");
	
		var options = {
			url: "https://" + endpoint + "/chat/Dialog/" + dialog_id + ".json",
			headers: {
				"QB-Token": getTemp("session", "token")
			},
			json: {
				push_all: {
					occupants_ids: [user1]
				}
			}
		};
		
		my.begin = startTime();
		request.put(options, function(error, response, body) {
			if(!error && typeof body.xmpp_room_jid !== "undefined") {
				timeTo(my.name, getLatency(my.begin));
				next(my.name);
			} else {
				if(error === null || typeof error === "undefined" && response.body && response.body.errors) { error=JSON.stringify(response.body.errors); };
				failed(my.name, error.toString());
			}
		});
	}
}

module.exports = start;

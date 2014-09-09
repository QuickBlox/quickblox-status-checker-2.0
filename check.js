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

var instances = config.instances,
	status_app = config.status_app,
	LOG_CHECKS = true;

var table = "TestingClassNode", // name of table to test custom object creation with
	latency = {},
	current_instance = 0,
	error_log = {},
	misc = {};
	
	latency.total = {};

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


function start() {
	var current = current_instance,
		app_id = instances[current].app_id,
		auth_key = instances[current].auth_key,
		auth_secret = instances[current].auth_secret,
		endpoint = instances[current].endpoint;
	
	QB.init(app_id, auth_key, auth_secret, false);
	QB.service.qbInst.config.endpoints.api = endpoint;
	order.first();
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
	if(current_instance+1 === instances.length) {
		
		var whole_total = 0;
		for(var fig in latency.total) {
			whole_total += latency.total[fig];
		}
		
		console.log(moment().format("DD/MM/YY HH:mm:ss") + " [" + thisInstance("name") + "] Completed checks ("+ latency.total[thisInstance("name")] + "ms)")
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
    		}, 5000)
		});
		
	} else {
	    console.log(moment().format("DD/MM/YY HH:mm:ss") + " [" + thisInstance("name") + "] Completed checks ("+ latency.total[thisInstance("name")] + "ms)");
		current_instance++;
		misc = {};
		start();
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
	return (typeof item !== "undefined" ? instances[current_instance][item] : instances[current_instance]);
}

function reset() {
    latency = {};
	current_instance = 0;
	error_log = {};
	latency.total = {};
	misc = {};
	console.log("{latency} has a length of " + Object.keys(latency).length)
	if(Object.keys(latency).length > 0) {
		console.log(latency);
	}
}

function timeTo(stat, time) {
	
	var instanceName = thisInstance("name");

	var time_now = moment().format("DD/MM/YY HH:mm:ss.SSS");
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

function user(qb_user) {
	if (typeof qb_user !== "undefined") misc.qb_user = qb_user;
	else return misc.qb_user;
}

function content(id) {
	if (typeof id !== "undefined") misc.content_id = id;
	else return misc.content_id || null;
}

function geo(id) {
	if (typeof id !== "undefined") misc.geodata_id = id;
	else return misc.geodata_id || null;
}

function place(id) {
	if (typeof id !== "undefined") misc.place_id = id;
	else return misc.place_id;
}

function co_data(id) {
    if(typeof id !== "undefined") {
    	misc.customobjects_id = id;
    }
    else if (typeof misc.customobjects_id !== "undefined" && typeof id === "undefined") {
    	return { _id: misc.customobjects_id, Hello: "Привет! Меня зовут также Алекс! приятно познакомиться )"};
    }
    else if (typeof misc.customobjects_id === "undefined" && typeof id === "undefined") {
    	return { Hello: "Алло! Меня зовут Алекс." };
    }
}

function messages(id) {
	if (typeof id !== "undefined") misc.messages_id = id;
	else return misc.messages_id;
}

function dialog(chat_dialog) {
	if (typeof chat_dialog !== "undefined") misc.chat_dialog = chat_dialog;
	else if(typeof chat_dialog === "undefined" && typeof misc.chat_dialog === "undefined") return -1;
	else return misc.chat_dialog;
}

function createSession() {
	var my = {};
	my.begin = startTime();
	my.name = "Create session";
		
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
	var my = {};
	my.begin = startTime();
	my.name = "Create user";
	
	QB.users.create({ full_name: chance.name(), login: newName(), password: "password1234" }, function(error, response){
	    if(error) {
	        failed(my.name, error);
	        my = null;
	    } else {
	        timeTo(my.name, getLatency(my.begin));
	        user(response);
	        next(my.name);
	        my = null;
	    }
	});
}

function createUserSession() {
	var my = {};
	my.begin = startTime();
	my.name = "Create user session";
	
	QB.createSession({ login: user().login, password: "password1234" }, function(error, response){
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
	var my = {};
	my.begin = startTime();
	my.name = "List users";
	
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
	var my = {};
	my.begin = startTime();
	my.name = "Update user";
	
	QB.users.update(user().id, {website: chance.domain()}, function(error, response){
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
	var my = {};
	my.begin = startTime();
	my.name = "Delete user";
	
	QB.users.delete(user().id, function(error, response){
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
    this.begin = startTime();
    this.name = "Destroy session";
	var my = this;
    
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
    this.name = "Create new session";
	var my = this;
    
    QB.createSession(config.masterLogin, function(error, response){
	    if(error) {
	        failed(my.name, error);
	        my = null;
	    } else {
	        next(my.name);
	        my = null;
	    }
	});
}

function createGeodata() {
	var my = {};
	my.begin = startTime();
	my.name = "Create geodata";
	
	QB.location.geodata.create({ latitude: chance.latitude(), longitude: chance.longitude() }, function(error, response){
	    if(error) {
	        failed(my.name, error);
	        my = null;
	    } else {
	        timeTo(my.name, getLatency(my.begin));
	        geo(response.id);
	        next(my.name);
	        my = null;
	    }
	});
}

function createPlace() {
	var my = {};
	my.begin = startTime();
	my.name = "Create place";
	
	QB.location.places.create({ geo_data_id: geo(), title: chance.street(), address: chance.address()}, function(error, response){
	    if(error) {
	        failed(my.name, error);
	        my = null;
	    } else {
	        timeTo(my.name, getLatency(my.begin));
	        place(response.place.id);
	        next(my.name);
	        my = null;
	    }
	});
}

function deletePlace() {
	var my = {};
	my.begin = startTime();
	my.name = "Delete place";
	QB.location.places.delete(place(), function(error, response){
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
	var my = {};
	my.begin = startTime();
	my.name = "Create content";
	
	QB.content.create({name: chance.capitalize(chance.word()), content_type: "image/png", 'public': true}, function(error, response){
	    if(error) {
	        failed(my.name, error);
	        my = null;
	    } else {
	        timeTo(my.name, getLatency(my.begin));
	        content(response.id);
	        next(my.name);
	        my = null;
	    }
	});
}

function listContent() {
	var my = {};
	my.begin = startTime();
	my.name = "List content";
	
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
	var my = {};
	my.begin = startTime();
	my.name = "Delete content";
	
	QB.content.delete(content(), function(error, response){
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
	var my = {};
	my.begin = startTime();
	my.name = "Create data";
	
	QB.data.create(table, co_data(), function(error, response){
	    if(error) {
	        failed(my.name, error);
	        my = null;
	    } else {
	        timeTo(my.name, getLatency(my.begin));
	        co_data(response._id);
	        next(my.name);
	        my = null;
	    }
	});
}

function updateData() {
	var my = {};
	my.begin = startTime();
	my.name = "Update data";
		
	QB.data.update(table, co_data(), function(error, response){
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
	var my = {};
	my.begin = startTime();
	my.name = "List data";
	
	QB.data.list(table, function(error, response){
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
	var my = {};
	my.begin = startTime();
	my.name = "Delete data";
	
	QB.data.delete(table, co_data()._id, function(error, response){
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
	var my = {};
	my.begin = startTime();
	my.name = "Create push";
		
	QB.messages.tokens.create({environment: "development", client_identification_sequence: "144", platform: "ios", udid: "2b6f0cc904d137be2e1730235f5664094b831186"}, function(error, response){
	    if (error) {
	        failed(my.name, error);
	        my = null;
	    } else {
            timeTo(my.name, getLatency(my.begin));
            messages(response.id);
	        next(my.name);
	        my = null;
	    }
	});
}

function deletePush() {
	var my = {};
	my.begin = startTime();
	my.name = "Delete push";
		
	QB.messages.tokens.delete(messages(), function(error, response){
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
	var my = {};
	my.begin = 0;
	my.name = "Create dialog";	
	
	if(thisInstance("chat_enabled") === false || thisInstance("chat_v2") === false) {
		moduleDisabled(my.name);
	} else {
		
		var chat_users = config.xmpp[thisInstance("name")],
			endpoint = thisInstance("endpoint");
		
		console.log("setting headers on request to https://" + endpoint + "/chat/Dialog.json");
		
		var options = {
			url: "https://" + endpoint + "/chat/Dialog.json",
			headers: {
				"QB-Token": QB.service.qbInst.session.token
			},
			json: {
				occupants_ids: [chat_users.sender.jid.split("-")[0], chat_users.recipient.jid.split("-")[0]].toString(),
				name: "Developer Chat (" + moment().format("DD-MM-YY") + ") - " + chance.natural({min: 1, max: 999999}),
				type: 2
			}
		};
			
		my.begin = startTime();
		request.post(options, function(error, response, body) {
			if(!error && typeof body.xmpp_room_jid !== "undefined") {
				dialog(body);
				timeTo(my.name, getLatency(my.begin));
				next(my.name);
			} else {
				if(error === null || typeof error === "undefined") {error="Empty response"}
				failed(my.name, error.toString());
			}
		});
	}
}

function privateChat() {
	var my = {}, 
		current_xmpp = config.xmpp[thisInstance("name")],
		message_hash = chance.hash(),
		sender, receiver, listeners, sendMessage, onChat;
		
	my.latency = 0;
	my.name = "Private chat";
	
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
	var my = {}, current_xmpp = config.xmpp[thisInstance("name")], sender, receiver, listeners, message_hash = chance.hash(), sendMessage, onStanza, senderStanza, presence_count = 0;
	my.latency = 0;
	my.name = "Group chat";
	
	if(thisInstance("chat_enabled") === false || thisInstance("chat_v2") === false) {
		moduleDisabled(my.name);
	} else if (dialog() === -1) { // the dialog() method will return -1 if the previous dialog creation method failed
		failed(my.name, "Could not test group chat due to dialog creation failure.");
	} else {
		
		var room_jid = dialog().xmpp_room_jid;
		
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
				
				stanza = stanza.children[0].children[0];
				
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
	var my = {};
	my.begin = 0;
	my.name = "Retrieve dialogs";	
	
	if(thisInstance("chat_enabled") === false || thisInstance("chat_v2") === false) {
		moduleDisabled(my.name);
	} else {
		
		var endpoint = thisInstance("endpoint");
		
		console.log("setting headers on request to https://" + endpoint + "/chat/Dialog.json");
	
		var options = {
			url: "https://" + endpoint + "/chat/Dialog.json",
			headers: {
				"QB-Token": QB.service.qbInst.session.token
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
				if(error === null || typeof error === "undefined") {error="Empty response"}
				failed(my.name, error.toString());
			}
		});
	}
}

function removeDialogOccupant() {
	var my = {};
	my.begin = 0;
	my.name = "Remove dialog occupant";
	
	if(thisInstance("chat_enabled") === false || thisInstance("chat_v2") === false) {
		moduleDisabled(my.name);
	} else if (dialog() === -1) { // the dialog() method will return -1 if the previous dialog creation method failed
		failed(my.name, "Could not '" + my.name + "' due to dialog creation failure.");
	} else {
		
		var	endpoint 	= thisInstance("endpoint"),
			dialog_id 	= dialog()._id,
			user1		= dialog().occupants_ids[0]; // ID of user to remove
				
		console.log("setting headers on request to https://" + endpoint + "/chat/Dialog.json");
	
		var options = {
			url: "https://" + endpoint + "/chat/Dialog/" + dialog_id + ".json",
			headers: {
				"QB-Token": QB.service.qbInst.session.token
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
				if(error === null || typeof error === "undefined" || error == "") {error="Empty response"}
				failed(my.name, error.toString());
			}
		});
	}
}

function addDialogOccupant() {
	var my = {};
	my.begin = 0;
	my.name = "Add dialog occupant";
	
	if(thisInstance("chat_enabled") === false || thisInstance("chat_v2") === false) {
		moduleDisabled(my.name);
	} else if (dialog() === -1) { // the dialog() method will return -1 if the previous dialog creation method failed
		failed(my.name, "Could not '" + my.name + "' due to dialog creation failure.");
	} else {
	
		var	endpoint 	= thisInstance("endpoint"),
			dialog_id 	= dialog()._id,
			user1		= dialog().occupants_ids[0]; // ID of user to remove
				
		console.log("setting headers on request to https://" + endpoint + "/chat/Dialog.json");
	
		var options = {
			url: "https://" + endpoint + "/chat/Dialog/" + dialog_id + ".json",
			headers: {
				"QB-Token": QB.service.qbInst.session.token
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
				if(error === null || typeof error === "undefined" || error == "") {error="Empty response"}
				failed(my.name, error.toString());
			}
		});
	}
}

module.exports = start;

'use strict';

var config      = require("./config"),
    ChatUser    = require("./chat"),
    helpers     = require("./helpers"),
    alert       = require("./alerts"),
    util        = require("util"),
    QuickBlox   = require("quickblox").QuickBlox,
    request     = require("request"),
    chance      = require("chance").Chance(),
    colors      = require("colors");

var status_app = config.status_app,
    LOG_CHECKS = false,
    abort = false;

var latency = { total: {} },
    current_instance = 0,
    error_log = {};


// This is a map of all the functions to complete.
// I just thought it was cleaner than referencing
// the next status.after each check.

var order = ["createSession", "createUser", "createUserSession", "listUsers", "updateUser", "deleteUser", "destroySession", "createNewSession", "createGeodata", "createPlace", "deletePlace", "createContent", "listContent", "deleteContent", "createData", "updateData", "listData", "deleteData", "createPush", "deletePush", "createDialog", "privateChat", "groupChat", "retrieveDialogs", "removeDialogOccupant", "addDialogOccupant", "end"];

function Check(instance, options, callback) {
    
    // Instance will one object
    // { name: "QuickbloxStarter", app_id: ... }
    
    this.QB = new QuickBlox();
    
    this.instance = instance;
    
    this.options = options || {};
    
    if(callback) this.callback = callback;
    else this.callback = function(){};
    
    this.latency = {};
    this.total = 0;
    this.errors = [];
    this.data = {};
    
    this.abort = false;
    
    this.stop = function() {
        abort = true;
    };
    
    this.get = function(module, field) {
        if(module && !field && this.data[module]) {
            return this.data[module];
        } else if (module && field && this.data[module]) {
            if(this.data[module][field]) {
                return this.data[module][field]
            } else {
                return null;
            }
        } else {
            return null;
        }
    };

    this.set = function(module, record) {
        if(!module || !record) {
            return this.data = {};
        } else {
            this.data[module] = record;
        }
    };
    
    this.timeto = function(stat, latency) {
        var name = this.instance.name,
            time = helpers.time("DD/MM/YY HH:mm:ss"),
            stat = stat.toLowerCase(),
            unit, latencyObject;
    
        if (latency > 0) unit = latency + "ms";
        else if (latency === -1) unit = "disabled";
        else unit = "failed";
    
        if(LOG_CHECKS) console.log("%s [%s] %s (%s)", time, name, stat, unit);
    
        stat = helpers.safeName(stat);
        
        this.latency[stat] = latency;
        this.total += latency;

        return this;
    };
    
    this.failed = function(module, error) {
        var instance = this.instance.name;
        var errormsg = { module: module, details: error };
        console.log(error);
        this.errors.push(errormsg);

        this.timeto(module, 0);
        this.next(module);
        return this;
    };
    
    this.disabled = function(module) {
        this.timeto(module, -1);
        this.next(module);
        return this;
    };
    
    this.end = function() {

        var time = helpers.time("DD/MM/YY HH:mm:ss"),
            check = this;

        if(!check.options.quiet && check.instance.email_alerts !== false && check.errors.length > 0) {
            alert(check.instance.name, { latency: check.latency, errors: check.errors }, function(error, response) {
                if(!error) console.log("%s: Sent an error email for %s.", time, check.name);
            });
            console.log("Would have sent an alert.");
        }
        
        if(!check.options.quiet) {
            sendlogs(check, function() {
                console.log("%s [%s] Completed checks (total: %sms)".green, time, check.instance.name, check.total);
                check.callback({latency: check.latency, errors: check.errors, total: check.total});
            });
        }
        
        if(check.options.quiet) {
            check.callback({latency: check.latency, errors: check.errors, total: check.total});
        }
    };
    
    this.next = function(name) {
        if(!this.abort) {
            var next_func = 0;
            name = helpers.camel(helpers.safeName(name));
            for(var i = 0, len = order.length; i < len; ++i) {
                if(order[i] === name) next_func = i + 1;
            }
            (order[next_func] !== "end" ? status : this)[order[next_func]](this);
        } else {
            this.abort = false;
            console.log("Request was aborted".red);
            this.callback(-1);
        }
    };
    
    this.init = function() {
        var check = this;
        this.QB.init(this.instance.app_id, this.instance.auth_key, this.instance.auth_secret, false);
        this.QB.service.qbInst.config.endpoints.api = this.instance.endpoint;
        setTimeout(function() {status[order[0]](check);}, 1000);
    };
    
    this.init();
}

function sendlogs(check, callback) {
    
    var QB = new QuickBlox();
    
    QB.init(status_app.app_id, status_app.auth_key, status_app.auth_secret, false);
    QB.service.qbInst.config.endpoints.api = status_app.endpoint;

    QB.createSession(status_app.login, function(error, response){
        if(!error) {

            var params = {
                logs: JSON.stringify(check.latency),
                errors: (check.errors.length !== 0 ? JSON.stringify(check.errors) : null),
                total_latency: check.total,
                hours: helpers.time("HH"),
                minutes: helpers.time("mm")
            };
            
            QB.data.create(check.instance.name, params, function(error, response){
                if (!error) {
                    console.log(("Sent logs for " + check.instance.name));
                    callback();
                } else {
                    console.log(("Failed to send logs for " + check.instance.name).red);
                    console.log(error);
                }
            });

        } else {
            console.log("Couldn't send logs. Will try next time.");
        }
    });
}

function RequestTimeout(name, check) {
    this.start = setTimeout(function() {
        check.failed(name, "Request timed out after " + config.global_timeout / 1000 + " seconds.");
    }, config.global_timeout);
    this.end = function() {
        clearTimeout(this.start);
    };
};

var status = {};

status.createSession = function(check) {
    var my = {
        begin: helpers.startTime(),
        name: "Create session" };

    my.timeout = new RequestTimeout(my.name, check);

    check.QB.createSession(function(error, response){
        my.timeout.end();
        if(error) {
            console.log("error");
            console.log(error);
            check.failed(my.name, error);
            my = null;
        } else {
            check.timeto(my.name, helpers.getLatency(my.begin)).next(my.name);
            my = null;
        }
    });
}

status.createUser = function(check) {
    var my = {
        begin: helpers.startTime(),
        name: "Create user",
        module: "user" };

    my.timeout = new RequestTimeout(my.name, check);

    check.QB.users.create({ full_name: chance.name(), login: helpers.newName(), password: "password1234" }, function(error, response){
        my.timeout.end();
        if(error) {
            check.failed(my.name, error);
            my = null;
        } else {
            check.timeto(my.name, helpers.getLatency(my.begin));
            check.set(my.module, response);
            check.next(my.name);
            my = null;
        }
    });
}

status.createUserSession = function(check) {
    var my = {
        begin: helpers.startTime(),
        name: "Create user session",
        module: "user" };

    my.timeout = new RequestTimeout(my.name, check);

    check.QB.createSession({ login: check.get(my.module, "login"), password: "password1234" }, function(error, response){
        my.timeout.end();
        if(error) {
            check.failed(my.name, error);
            my = null;
        } else {
            check.timeto(my.name, helpers.getLatency(my.begin));
            check.next(my.name);
            my = null;
        }
    });
}

status.listUsers = function(check) {
    var my = {
        begin: helpers.startTime(),
        name: "List users" };

    my.timeout = new RequestTimeout(my.name, check);

    check.QB.users.listUsers(function(error, response){
        my.timeout.end();
        if(error) {
            check.failed(my.name, error);
            my = null;
        } else {
            check.timeto(my.name, helpers.getLatency(my.begin));
            check.next(my.name);
            my = null;
        }
    });
}

status.updateUser = function(check) {
    var my = {
        begin: helpers.startTime(),
        name: "Update user",
        module: "user" };

    my.timeout = new RequestTimeout(my.name, check);

    check.QB.users.update( check.get(my.module, "id"), { website: chance.domain() }, function(error, response){
        my.timeout.end();
        if(error) {
            check.failed(my.name, error);
            my = null;
        } else {
            check.timeto(my.name, helpers.getLatency(my.begin));
            check.next(my.name);
            my = null;
        }
    });
}

status.deleteUser = function(check) {
    var my = {
        begin: helpers.startTime(),
        name: "Delete user",
        module: "user" };

    my.timeout = new RequestTimeout(my.name, check);

    check.QB.users.delete( check.get(my.module, "id") || 0, function(error, response){
        my.timeout.end();
        if(error) {
            check.failed(my.name, error);
            my = null;
        } else {
            check.timeto(my.name, helpers.getLatency(my.begin));
            check.next(my.name);
            my = null;
        }
    });
}

status.destroySession = function(check) {
    var my = {
        begin: helpers.startTime(),
        name: "Destroy session" };

    my.timeout = new RequestTimeout(my.name, check);

    check.QB.destroySession(function(error, response){
        my.timeout.end();
        if(error) {
            check.failed(my.name, error);
            my = null;
        } else {
            check.set("session", -1);
            check.timeto(my.name, helpers.getLatency(my.begin));
            check.next(my.name);
            my = null;
        }
    });
}

status.createNewSession = function(check) {
    var my = {
        begin: helpers.startTime(),
        name: "Create new session" };

    my.timeout = new RequestTimeout(my.name, check);

    check.QB.createSession(config.masterLogin, function(error, response){
        my.timeout.end();
        if(error) {
            console.log("New session creation failed".red);
            check.failed(my.name, error);
            my = null;
        } else {
            check.set("session", { token: response.token });
            check.next(my.name);
            my = null;
        }
    });
}

status.createGeodata = function(check) {
    var my = {
        begin: helpers.startTime(),
        name: "Create geodata",
        module: "geodata" };

    my.timeout = new RequestTimeout(my.name, check);

    check.QB.location.geodata.create({ latitude: chance.latitude(), longitude: chance.longitude() }, function(error, response){
        my.timeout.end();
        if(error) {
            check.failed(my.name, error);
            my = null;
        } else {
            check.timeto(my.name, helpers.getLatency(my.begin));
            check.set(my.module, response);
            check.next(my.name);
            my = null;
        }
    });
}

status.createPlace = function(check) {
    var my = {
        begin: helpers.startTime(),
        name: "Create place",
        module: "place" };

    my.timeout = new RequestTimeout(my.name, check);

    check.QB.location.places.create({ geo_data_id: check.get("geodata", "id"), title: chance.street(), address: chance.address()}, function(error, response){
        my.timeout.end();
        if(error) {
            check.failed(my.name, error);
            my = null;
        } else {
            check.timeto(my.name, helpers.getLatency(my.begin));
            check.set(my.module, response.place);
            check.next(my.name);
            my = null;
        }
    });
}

status.deletePlace = function(check) {
    var my = {
        begin: helpers.startTime(),
        name: "Delete place",
        module: "place" };

    my.timeout = new RequestTimeout(my.name, check);

    check.QB.location.places.delete( check.get(my.module, "id"), function(error, response){
        my.timeout.end();
        if(error) {
            check.failed(my.name, error);
            my = null;
        } else {
            check.timeto(my.name, helpers.getLatency(my.begin));
            check.next(my.name);
            my = null;
        }
    });
}

status.createContent = function(check) {
    var my = {
        begin: helpers.startTime(),
        name: "Create content",
        module: "content" };

    my.timeout = new RequestTimeout(my.name, check);

    check.QB.content.create({ name: chance.capitalize(chance.word()), content_type: "image/png", 'public': true }, function(error, response){
        my.timeout.end();
        if(error) {
            check.failed(my.name, error);
            my = null;
        } else {
            check.timeto(my.name, helpers.getLatency(my.begin));
            check.set(my.module, response);
            check.next(my.name);
            my = null;
        }
    });
}

status.listContent = function(check) {
    var my = {
        begin: helpers.startTime(),
        name: "List content",
        module: "content" };

    my.timeout = new RequestTimeout(my.name, check);

    check.QB.content.list(function(error, response){
        my.timeout.end();
        if(error) {
            check.failed(my.name, error);
            my = null;
        } else {
            check.timeto(my.name, helpers.getLatency(my.begin));
            check.next(my.name);
            my = null;
        }
    });
}

status.deleteContent = function(check) {
    var my = {
        begin: helpers.startTime(),
        name: "Delete content",
        module: "content" };

    my.timeout = new RequestTimeout(my.name, check);

    check.QB.content.delete( check.get(my.module, "id"), function(error, response){
        my.timeout.end();
        if(error) {
            check.failed(my.name, error);
            my = null;
        } else {
            check.timeto(my.name, helpers.getLatency(my.begin));
            check.next(my.name);
            my = null;
        }
    });
}

status.createData = function(check) {
    var my = {
        begin: helpers.startTime(),
        name: "Create data",
        module: "data" };

    my.timeout = new RequestTimeout(my.name, check);

    check.QB.data.create(config.testingTable, { Hello: chance.sentence() }, function(error, response){
        my.timeout.end();
        if(error) {
            check.failed(my.name, error);
            my = null;
        } else {
            check.timeto(my.name, helpers.getLatency(my.begin));
            check.set(my.module, response);
            check.next(my.name);
            my = null;
        }
    });
}

status.updateData = function(check) {
    var my = {
        begin: helpers.startTime(),
        name: "Update data",
        module: "data" };

    my.timeout = new RequestTimeout(my.name, check);

    check.QB.data.update(config.testingTable, { _id: check.get(my.module, "_id"), Hello: chance.sentence() }, function(error, response){
        my.timeout.end();
        if(error) {
            check.failed(my.name, error);
            my = null;
        } else {
            check.timeto(my.name, helpers.getLatency(my.begin));
            check.next(my.name);
            my = null;
        }
    });
}

status.listData = function(check) {
    var my = {
        begin: helpers.startTime(),
        name: "List data" };

    my.timeout = new RequestTimeout(my.name, check);

    check.QB.data.list(config.testingTable, function(error, response){
        my.timeout.end();
        if(error) {
            check.failed(my.name, error);
            my = null;
        } else {
            check.timeto(my.name, helpers.getLatency(my.begin));
            check.next(my.name);
            my = null;
        }
    });
}

status.deleteData = function(check) {
    var my = {
        begin: helpers.startTime(),
        name: "Delete data",
        module: "data" };

    my.timeout = new RequestTimeout(my.name, check);

    check.QB.data.delete(config.testingTable, check.get(my.module, "_id"), function(error, response){
        my.timeout.end();
        if(error) {
            check.failed(my.name, error);
            my = null;
        } else {
            check.timeto(my.name, helpers.getLatency(my.begin));
            check.next(my.name);
            my = null;
        }
    });
}

status.createPush = function(check) {
    var my = {
        begin: helpers.startTime(),
        name: "Create push",
        module: "messages" };

    my.timeout = new RequestTimeout(my.name, check);

    check.QB.messages.tokens.create({environment: "development", client_identification_sequence: "144", platform: "ios", udid: chance.apple_token() }, function(error, response){
        my.timeout.end();
        if (error) {
            check.failed(my.name, error);
            my = null;
        } else {
            check.timeto(my.name, helpers.getLatency(my.begin));
            check.set(my.module, response);
            check.next(my.name);
            my = null;
        }
    });
}

status.deletePush = function(check) {
    var my = {
        begin: helpers.startTime(),
        name: "Delete push",
        module: "messages" };

    my.timeout = new RequestTimeout(my.name, check);

    check.QB.messages.tokens.delete( check.get(my.module, "id"), function(error, response){
        my.timeout.end();
        if (error) {
            check.failed(my.name, error);
            my = null;
        } else {
            check.timeto(my.name, helpers.getLatency(my.begin));
            check.next(my.name);
            my = null;
        }
    });
}

status.createDialog = function(check) {
    var my = {
        begin: 0,
        name: "Create dialog",
        module: "chat" };

    if(check.instance.chat_enabled === false || check.instance.chat_v2 === false) {
        check.disabled(my.name);
    } else {

        var users = [check.instance.xmpp.sender.jid.split("-")[0], check.instance.xmpp.recipient.jid.split("-")[0]];

        var options = {
            url: "https://" + check.instance.endpoint + "/chat/Dialog.json",
            timeout: config.global_timeout,
            headers: {
                "QB-Token": check.get("session", "token")
            },
            json: {
                occupants_ids: users.toString(),
                name: util.format( "Developer chat (%s) - %d", helpers.time("DD-MM-YY"), helpers.rand([1, 999999]) ),
                type: 2
            }
        };

        my.begin = helpers.startTime();

        request.post(options, function(error, response, body) {
            if(!error && typeof body.xmpp_room_jid !== "undefined") {
                check.set(my.module, body);
                check.timeto(my.name, helpers.getLatency(my.begin));
                check.next(my.name);
            } else {
                if(error === null || typeof error === "undefined" && response.body && response.body.errors) {
                    error = JSON.stringify(response.body.errors);
                } else if (typeof body === "string" && body.indexOf("DOCTYPE") !== -1) {
                    error = "500 'Something went wrong' (HTML response)";
                } else if (error.code === "ETIMEDOUT") {
                    error = "Timed out after " + config.global_timeout / 1000 + " seconds.";
                } else if (error.base) {
                    error = error.base[0];
                }
                check.set(my.module, -1);
                check.failed(my.name, error);
            }
        });
    }
}

status.privateChat = function(check) {
    var my = {
        latency: 0,
        name: "Private chat",
        module: "chat" },

        current_xmpp = check.instance.xmpp,
        message_hash = chance.hash(),
        sender, receiver, listeners, sendMessage, onChat;

    if(check.instance.chat_enabled === false) {
        check.disabled(my.name);
    } else {

        var kill = function(reason) {
            receiver.disconnect();
            sender.disconnect();
            receiver = null;
            sender = null;
            if(typeof reason !== "undefined") {
                check.failed(my.name, reason);
            }
        };

        my.self_destruct = setTimeout(function() {
            kill("Timed out after " + config.chat_timeout / 1000 + " seconds.");
        }, config.chat_timeout);

        onChat = function(from, message) {

            var timeReceived = Date.now(),
                passed;

            clearTimeout(my.self_destruct);

            if( message.indexOf(":") !== -1 ) {
                message = message.split(":");
                my.latency = timeReceived-message[1];

                if(message_hash === message[0]) {
                    check.timeto(my.name, my.latency);
                    check.next(my.name);
                    kill();
                } else {
                    kill("Message was received but was inconsistent. (Sent '" + message_hash + "' but received '" + message[0] + "')");
                }

            } else {
                kill("Message was completely malformed and could not be read.");
            }
        };

        receiver = new ChatUser({
            credentials: helpers.clone(current_xmpp.recipient),
            defaults: false,
            on: { chat: onChat }
        });

        sender = new ChatUser({
            credentials: helpers.clone(current_xmpp.sender),
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

status.groupChat = function(check) {
    var my = {
        latency: 0,
        name: "Group chat",
        module: "chat" },

        current_xmpp = check.instance.xmpp,
        sender, receiver, listeners, sendMessage, onStanza, senderStanza,
        message_hash = chance.hash(),
        presence_count = 0,
        hasKilled = false;

    if( check.instance.chat_enabled === false || check.instance.chat_v2 === false ) {
        check.disabled(my.name);
    }
    else if ( check.get(my.module) === -1 ) { // this method will return -1 if the previous dialog creation method failed
        check.failed(my.name, "Could not complete due to dialog creation failure.");
    }
    else {

        var room_jid = check.get(my.module, "xmpp_room_jid");

        var kill = function(reason) {
            receiver.disconnect();
            sender.disconnect();
            receiver = null;
            sender = null;
            hasKilled = true;
            if(typeof reason !== "undefined") {
                check.failed(my.name, reason);
            }
            return;
        };

        my.self_destruct = setTimeout(function() {
            kill("Timed out after " + config.chat_timeout / 1000 + " seconds.");
        }, config.chat_timeout);

        senderStanza = function(stanza) {
            if(stanza.name === "presence") {
                presence_count++;
                if(presence_count === 3) {
                    setTimeout(function() {
                        if(!hasKilled) {
                            sender.send({
                                to: room_jid,
                                message: message_hash + ":" + Date.now(),
                                group: true,
                                history: true
                            });
                        }
                    }, 4000);
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
                        check.timeto(my.name, my.latency);
                        check.next(my.name);
                    } else {
                        kill("Message was received but was inconsistent. (Sent '" + message_hash + "' but received '" + stanza[0] + "')");
                    }

                } else {
                    kill("Message was completely malformed and could not be read.");
                }
            }
        };

        receiver = new ChatUser({
            credentials: helpers.clone(current_xmpp.recipient),
            defaults: false,
            on: {online: function(){ receiver.join(room_jid + "/" + current_xmpp.recipient.jid.split("-")[0]); }, stanza: onStanza},
        });

        sender = new ChatUser({
            credentials: helpers.clone(current_xmpp.sender),
            defaults: false,
            on: { online: function() {sender.join(room_jid + "/" + current_xmpp.sender.jid.split("-")[0]);}, stanza: senderStanza }
        });
    }
}

status.retrieveDialogs = function(check) {
    var my = {
        begin: 0,
        name: "Retrieve dialogs",
        module: "chat" };

    if( check.instance.chat_enabled === false || check.instance.chat_v2 === false ) {
        check.disabled(my.name);
    } else {

        var options = {
            url: "https://" + check.instance.endpoint + "/chat/Dialog.json",
            timeout: config.global_timeout,
            headers: {
                "QB-Token": check.get("session", "token")
            },
            json: {
                limit: 1
            }
        };

        my.begin = helpers.startTime();

        request.get(options, function(error, response, body) {
            if(!error && typeof body.items !== "undefined") {
                check.timeto(my.name, helpers.getLatency(my.begin));
                check.next(my.name);
            } else {
                if(error === null || typeof error === "undefined" && response.body && response.body.errors) {
                    error = JSON.stringify(response.body.errors);
                } else if (typeof body === "string" && body.indexOf("DOCTYPE") !== -1) {
                    error = "500 'Something went wrong' (HTML response)";
                } else if (error.code === "ETIMEDOUT") {
                    error = "Timed out after " + config.global_timeout / 1000 + " seconds.";
                } else if (error.base) {
                    error = error.base[0];
                }
                check.failed(my.name, error);
            }
        });
    }
}

status.removeDialogOccupant = function(check) {
    var my = {
        begin: 0,
        name: "Remove dialog occupant",
        module: "chat" };

    if(check.instance.chat_enabled === false || check.instance.chat_v2 === false) {
        check.disabled(my.name);
    }
    else if (check.get(my.module) === -1) { // the dialog() method will return -1 if the previous dialog creation method failed
        check.failed(my.name, "Could not complete due to dialog creation failure.");
    }
    else {

        var endpoint    = check.instance.endpoint,
            dialog_id   = check.get(my.module, "_id"),
            user1       = check.get(my.module, "occupants_ids")[0]; // ID of user to remove

        var options = {
            url: "https://" + endpoint + "/chat/Dialog/" + dialog_id + ".json",
            timeout: config.global_timeout,
            headers: {
                "QB-Token": check.get("session", "token")
            },
            json: {
                pull_all: {
                    occupants_ids: [user1]
                }
            }
        };

        my.begin = helpers.startTime();
        request.put(options, function(error, response, body) {
            if(!error && typeof body.xmpp_room_jid !== "undefined") {
                check.timeto(my.name, helpers.getLatency(my.begin));
                check.next(my.name);
            } else {
                if(error === null || typeof error === "undefined" && response.body && response.body.errors) {
                    error = JSON.stringify(response.body.errors);
                } else if (typeof body === "string" && body.indexOf("DOCTYPE") !== -1) {
                    error = "500 'Something went wrong' (HTML response)";
                } else if (error.code === "ETIMEDOUT") {
                    error = "Timed out after " + config.global_timeout / 1000 + " seconds.";
                } else if (error.base) {
                    error = error.base[0];
                }
                check.failed(my.name, error);
            }
        });
    }
}

status.addDialogOccupant = function(check) {
    var my = {
        begin: 0,
        name: "Add dialog occupant",
        module: "chat" };

    if(check.instance.chat_enabled === false || check.instance.chat_v2 === false) {
        check.disabled(my.name);
    }
    else if (check.get(my.module) === -1) { // the dialog() method will return -1 if the previous dialog creation method failed
        check.failed(my.name, "Could not complete due to dialog creation failure.");
    }
    else {

        var endpoint    = check.instance.endpoint,
            dialog_id   = check.get(my.module, "_id"),
            user1       = check.get(my.module, "occupants_ids")[0]; // ID of user to add

        var options = {
            url: "https://" + endpoint + "/chat/Dialog/" + dialog_id + ".json",
            timeout: config.global_timeout,
            headers: {
                "QB-Token": check.get("session", "token")
            },
            json: {
                push_all: {
                    occupants_ids: [user1]
                }
            }
        };

        my.begin = helpers.startTime();
        request.put(options, function(error, response, body) {
            if(!error && typeof body.xmpp_room_jid !== "undefined") {
                check.timeto(my.name, helpers.getLatency(my.begin));
                check.next(my.name);
            } else {
                if(error === null || typeof error === "undefined" && response.body && response.body.errors) {
                    error = JSON.stringify(response.body.errors);
                } else if (typeof body === "string" && body.indexOf("DOCTYPE") !== -1) {
                    error = "500 'Something went wrong' (HTML response)";
                } else if (error.code === "ETIMEDOUT") {
                    error = "Timed out after " + config.global_timeout / 1000 + " seconds.";
                } else if (error.base) {
                    error = error.base[0];
                }
                check.set(my.module, -1);
                check.failed(my.name, error);
            }
        });
    }
}

if (process.argv[2] === "--go") {
    
    var index = -1;
    
    var go = function() {
        new Check(config.instances[++index], {}, function() {
            if(index !== config.instances.length - 1) go();
            else console.log("Completed for all instances.");
        });
    };
    
    go();

}

if (process.argv[2] === "--go-with-test") {
    var instance = config.testInstance;
    
    var checker = new Check(instance, function(data) {
        var name = instance.name;
        console.log("Finished".green);
        console.log("Errors: %d", data.errors.length);
        console.log("Total: %d", data.total);
        process.exit();
    });
}

if (process.argv[2] === "-i" && process.argv[3] !== "") {

    var index = 0, i, len = config.instances.length;
    for (i = 0; i < len; ++i) {
        if(config.instances[i].name.toLowerCase() === process.argv[3].toLowerCase()) index = i;
    }

    var instance = config.instances[index];
    
    var checker = new Check(instance, function(data) {
        var name = instance.name;
        console.log("Finished".green);
        console.log("Errors: %d", data.errors.length);
        console.log("Total: %d", data.total);
        process.exit();
    });
}

module.exports = Check;

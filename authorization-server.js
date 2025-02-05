const fs = require("fs");
const express = require("express");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");

const {
	randomString,
	containsAll,
	decodeAuthCredentials,
	timeout,
} = require("./utils")

const config = {
	port: 9001,
	privateKey: fs.readFileSync("assets/private_key.pem"),

	clientId: "my-client",
	clientSecret: "zETqHgl0d7ThysUqPnaFuLOmG1E=",
	redirectUri: "http://localhost:9000/callback",

	authorizationEndpoint: "http://localhost:9001/authorize",
}

const clients = {
	"my-client": {
		name: "Sample Client",
		clientSecret: "zETqHgl0d7ThysUqPnaFuLOmG1E=",
		scopes: ["permission:name", "permission:date_of_birth"],
	},
	"test-client": {
		name: "Test Client",
		clientSecret: "TestSecret",
		scopes: ["permission:name"],
	},
}

const users = {
	user1: "password1",
	john: "appleseed",
}

const requests = {}
const authorizationCodes = {}

let state = ""

const app = express()
app.set("view engine", "ejs")
app.set("views", "assets/authorization-server")
app.use(timeout)
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

app.get('/authorize', (req, res) => {
	const clientId = req.query['client_id'];
	const client = clients[clientId];
	if (!client) {
		res.status(401).send("Error: client not authorized");
		return;
	}

	const scope = req.query['scope'];
	const scopes = scope.split(" ");
	if (!containsAll(client.scopes, scopes)) {
		res.status(401).send("Error: invalid scopes requested");
		return;
	}

	const requestId = randomString();
	requests[requestId] = req.query;
	res.render("login", {
		client,
		scope,
		requestId
	});
});

app.post('/approve', (req, res) => {
	const { userName, password, requestId } =  req.body;
	const userPassword = users[userName];
	if (password !== userPassword) {
		res.status(401).send('Error: userName or password are not correct!');
		return;
	}

	const clientReq = requests[requestId];
	delete requests[requestId];
	if (!clientReq) {
		res.status(401).send('Error: The request id was not found!');
		return;
	}

	const randStringId = randomString();
	authorizationCodes[randStringId] = {
		userName,
		clientReq
	};

	const url = new URL(clientReq.redirect_uri);
	url.searchParams.append('code', randStringId);
	url.searchParams.append('state', clientReq.state);
	res.redirect(url.href);
});

app.post('/token', (req, res) => {
	const { authorization } = req.headers;

	if (!authorization) {
		res.status(401).send("Error: not authorized!");
		return;
	}

	const { clientId, clientSecret } = decodeAuthCredentials(authorization);
	const client = clients[clientId];
	if (!client || client.clientSecret !== clientSecret) {
		res.status(401).send("Error: client not authorized!");
		return;
	}

	const { code } = req.body;
	if (!code || !authorizationCodes[code]) {
		res.status(401).send("Error: invalid code!");
		return;
	}

	const { clientReq, userName } = authorizationCodes[code]
	delete authorizationCodes[code];
	const payload = {userName, scope: clientReq.scope};
	const tokenConfig = {
		algorithm: "RS256",
		expiresIn: 300,
		issuer: "http://localhost:" + config.port,
	};
	const token = jwt.sign(payload, config.privateKey, tokenConfig);

	res.json({
		access_token: token,
		token_type: "Bearer",
		scope: clientReq.scope,
	});
})

const server = app.listen(config.port, "localhost", function () {
	const host = server.address().address;
	const port = server.address().port;

	console.log('ZM:: NODE SERVER RUNNING IN PORT', port);
})

// for testing purposes

module.exports = { app, requests, authorizationCodes, server }

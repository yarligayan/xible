View.routes['/settings/general'] = function(EL) {

	EL.innerHTML = `
	<section>
		<h1>General</h1>
		<section id="webserver">
			<h2>Webserver</h2>
			<dl>

				<dt>
					<label for="settingsGeneralWebserverPort">
						Port
						<div>The plain-HTTP (non-SSL) port this web interface and the API routes are hosted on. If SSL is enabled, requests from this port are redirected to a secure connection on this port number incremented by 1.<br/>For example, if port 9600 is configured here and SSL is enabled, port 9601 will host the secure connection.</div>
					</label>
				</dt>
				<dd><input id="settingsGeneralWebserverPort" type="number" data-configpath="webServer.port" /></dd>

				<dt>
					<label for="settingsGeneralWebserverKeyPath">
						SSL key path
						<div>Path to a SSL key file. If configured together with the &quot;SSL certificate path&quot;, SSL will be enabled and plain HTTP requests redirect to the HTTPS connection.</div>
					</label>
				</dt>
				<dd><input id="settingsGeneralWebserverKeyPath" type="text" data-configpath="webServer.keyPath" /></dd>

				<dt>
					<label for="settingsGeneralWebserverCertPath">
						SSL certificate path
						<div>Path to a SSL certificate file. If configured together with the &quot;SSL key path&quot;, SSL will be enabled and plain HTTP requests redirect to the HTTPS connection.</div>
					</label>
				</dt>
				<dd><input id="settingsGeneralWebserverCertPath" type="text" data-configpath="webServer.certPath" /></dd>

			</dl>
		</section>
	</section>
	`;

};
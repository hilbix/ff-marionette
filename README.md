> This already is usable, but is in a very early state.

# ff-marionette

Make use of `firefox-esr --marionette` or similar.

> This will not be ported to Chromium.
>
> After a long and very frustrating search, I came to the conclusion, to not use WebDriver for Chromium at all,
> due to the very tedious `chromium-driver` involved, which needs to be separately loaded etc. pp.
> This is a no-go for me and leads into the wrong direction.
>
> Instead the native [devtools-protocol](https://chromedevtools.github.io/devtools-protocol/) looks far more promising
> which means, this here cannot be adapted to Chromium.  So if I ever come around doing so, I will create a similar
> but independent tool which then connects to `chromium --remote-debugging-port=XXXX` instead.


## Usage

	git clone https://github.com/hilbix/ff-marionette.git
	cd ff-marionette
	./ff-marionette.js $PORT

For this `firefox-esr --marionette` or similar must be already running.
Set the env variable `PORT` to the port Firefox uses.

> see `netstat -natp | grep LIST | grep firefox` or `ss -tlp | grep firefox`

Also be sure to have `nodejs` ready.  `$PORT` defaults to `2828` if it happen to be `0`

Then type some

	COMMAND JSON

and get the result as

	OK CMD JSON
	ERR CMD JSON

This needs the port, you perhaps can find it with

	netstat -natp | grep firefox | grep LISTEN

For shell usage use `bash` like this:

	coproc { ./ff-marionette.js $PORT; }

then

	while	read -r DO <&$COPROC && [ DO != "$DO" ]; do :; done

	# send commands after "DO" line is received
	echo COMMAND JSON >&${COPROC[1]}
	read -r RESPONSE CMD JSON <&$COPROC

and you can just send commands directly

	./ff-marionette.js 0 list

For all `COMMAND`s perhaps see

- <https://developer.mozilla.org/en-US/docs/Web/WebDriver/Commands>
- <https://searchfox.org/mozilla-central/rev/54c9b4896fdc1e858cd4942f306d877f1f3d195e/remote/marionette/driver.sys.mjs#3430>
- <chrome://remote/content/marionette/driver.sys.mjs> (on FireFox)
- To see a list of commands with their aliases and comments, [please look into the source code](ff-marionette.js)
  - Search for `const alias`

## Variables and special functions

The web element IDs (`element-6066-11e4-a52e-4f735466cecf`) returned change from session to session.
Hence you cannot use them accross two separate invocations, as different sessions are used.

However there are variables of the form `@name@` which are replaced literally (this is before JSON is parsed) by their value
found in the environment.  `@@` gives a `@` and any wrong `@`-sequence (like `name` is missing in environment) is output unchanged.

> This replacement is very simple and general and there is no JSON escapement or similar.
>
> `@` was chosen because it is seldomly present in HTML, JavaScript and JSON and even if something like `@name@` is found,
> `name` usually is not present in the environment, too.

These variables can be set from the output of the previous command with the command

	ENV name what

These variables are put into the execution environment, so all scripts forked by `ff-marionette.js` (currently: none) would see them, too.
Uppercase variables (like `PATH`) cannot be changed for safety.

- `name` is just a word
  - It must start with an lowercase letter.
- `what` defines what to extract
  - `= e` extract the element `.value[element-6066-11e4-a52e-4f735466cecf]` from the return, see `find` (this is the default)
  - `=` extract the `.value` from the return
  - `.` is complete object (as string)
  - `N` (a number) extract the `n`th array entry from the return (n starts at 0)
  - `N e` (a number followed by `e`) then extract then `n`th element (n starts at 0), see `finds`
  - `c` extract the count (length) of the array.
  - `l` extract the last index (length-1) of the array.
  - There probably is a lot missing for now
- You can give the `ENV` command multiply to set multiple variables

> Note that `ENV x 2 e` is syntactic sugar for:
>
>	ENV tmp 2
>	JSON {"value:{@tmp@}}
>	ENV x = e

There also is an `ECHO` function:

	ECHO whatever

You can use variables to expand.  Note that this output is a string which can be read via `ENV`.

	JSON "some json"

parses the argument as JSON which can be read via `ENV`, too.

	ECHO hello
	ENV world .

sets `@world@` to `"hello"`.

	JSON {"value":"world"}
	ENV world =

sets `@world@` to `"world"`.

> Yes, `ECHO`, `JSON` and `ENV` are evil hacks.
>
> But I did not come around for something better yet.
> Sorry.


### Commands not aliased / mentioned in the source yet

```
Marionette:AcceptConnections
Marionette:GetScreenOrientation
Marionette:GetWindowType
Marionette:SetContext
Marionette:SetScreenOrientation

Addon:Install
Addon:Uninstall

L10n:LocalizeEntity
L10n:LocalizeProperty

reftest:setup
reftest:run
reftest:teardown

WebDriver:FindElementFromShadowRoot
WebDriver:FindElementsFromShadowRoot

WebDriver:AcceptAlert
WebDriver:AcceptDialog
WebDriver:CloseChromeWindow
WebDriver:DeleteSession
WebDriver:DismissAlert

WebDriver:ElementClear
WebDriver:ElementSendKeys
WebDriver:GetActiveElement
WebDriver:GetAlertText
WebDriver:GetCapabilities
WebDriver:GetComputedLabel
WebDriver:GetComputedRole
WebDriver:GetElementCSSValue
WebDriver:GetElementRect
WebDriver:GetElementTagName
WebDriver:GetElementText
WebDriver:GetShadowRoot
WebDriver:GetTimeouts

WebDriver:IsElementDisplayed
WebDriver:IsElementEnabled
WebDriver:IsElementSelected

WebDriver:PerformActions

WebDriver:Print

WebDriver:ReleaseActions
WebDriver:SendAlertText
WebDriver:SetPermission
WebDriver:SetTimeouts
WebDriver:SwitchToFrame
WebDriver:SwitchToParentFrame
WebDriver:TakeScreenshot

WebAuthn:AddVirtualAuthenticator
WebAuthn:RemoveVirtualAuthenticator
WebAuthn:AddCredential
WebAuthn:GetCredentials
WebAuthn:RemoveCredential
WebAuthn:RemoveAllCredentials
WebAuthn:SetUserVerified
```


## FAQ

WTF why?

- Because I was unable to find something suitable for me anywhere else
- Trying to checkout the Gecko implementation of marionette-client took hours and left me with "No space left on device"
- Also I needed somethign for tiny devices like Raspberry PI Zero with very limited filesystem resources

Out of sequence?

- Commands are sent immediately if possible.
  - But the answer will be asynchronous, because the command runs asynchronously in the browser.
- To synchronize, request to set a variable from the output.   Example:
  - `./ff-marionette.js 0 list 'ENV w 1' 'WIN {"handle":@w@}' reload 'ENV x .' 'JSON @x@' 'find {"value":"run","using":"id"}'`
  - `ENV x .` fills variable `x` with the result of the `reload`.  This still is asynchronous
  - `JSON @x@` then uses the variable, hence it must be waited for, so the executon waits for `reload` before running `find`
- Perhaps in future there will be something like `WAIT` etc. to wait for completion

License?

- This Works is placed under the terms of the Copyright Less License,  
  see file COPYRIGHT.CLL.  USE AT OWN RISK, ABSOLUTELY NO WARRANTY.
- Read: Free as free beer, free speech and free baby


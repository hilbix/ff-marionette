#!/usr/bin/env nodejs
'use strict';
//
// [0,N, command, param] => [1,N,ko,ok]
//
// This Works is placed under the terms of the Copyright Less License,
// see file COPYRIGHT.CLL.  USE AT OWN RISK, ABSOLUTELY NO WARRANTY.

(async () => {

const DEBUG	= 0 ? console.log : (() => {});

const DIRECT	= process.argv.length > 3;		// direct commandline arguments
const isEOF	= new Promise(ok => process.stdin.on('end', ok));	// hack to detect EOF on </dev/null even with readline
const rl	= require('readline').createInterface({input:process.stdin});	// need to initialize it here to detects EOF early

const WebDriverMagic = 'element-6066-11e4-a52e-4f735466cecf';

const OUT = (...a) => process.stdout.write(`${a.join(' ')}\n`);
const ERR = (...a) => process.stderr.write(`${a.join(' ')}\n`);
const OOPS = (...a) => { ERR('OOPS', ...a); process.exit(23) }

// For some unknown reason NodeJS designs the arguments as follows:
// argv[0] is /usr/bin/node (I rather would expect the script path here)
// argv[1] is this script here (I rather would expect the first argument here)
// argv[2] is the first argument
const portVal	= process.argv[2];
if (portVal !== void 0 && `${portVal|0}` !== portVal) OOPS(`invalid port value: first argument: ${portVal}`);
const port	= (portVal|0) || 2828;
const net	= require('net');
const ff	= net.Socket();
const toJ	= JSON.stringify;

// Make Promise out of function taking a callback as last argument:
//	o[m](...a, cb)
// Why isn't this the default?
const P = (o,m,...a) =>
  {
    return new Promise((ok,ko) =>
      {
        try {
          o[m](...a, (...r) => ok(r));
        } catch (e) {
          ko(e);
        }
      });
  }

const dump = buf =>
  {
    try { return toJ(buf.toString()) } catch (e) {}
    try { return toJ(buf) } catch (e) {}
    return buf;
  }

let input = Buffer.alloc(0);

// Asynchronously answer the result from the send() below
const IDs = {}, pending = new Set();
const process_input_data = ([t,i,K,O]) =>
  {
    const k = IDs[i];
    if (t === 1 && k)
      {
        const {p,ok,ko,s} = k;
        delete IDs[i];
        pending.delete(p);
        if (O && !K) return ok(O);
        if (K && !O) return ko(K);
        ko([O,K]);
      }
    ERR('WTF', k, [t,i,K,O]);
  }
// Well, even that I never saw incomplete input, it might happen.
// Hence we have to assemble everything until we got a full packet.
// This is a bit complex, sorry.
const process_input = () =>
  {
    // {object} => prompt from Browser
    // count:[0,N,ko,ok] => command
    // count:[1,N,ko,ok] => response

    let digits=0, start, discard;
    for (const [i,c] of input.entries())
      {
        if (c>=48 && c<=57)		// 0-9
          {
            digits++;
            continue;
          }
        if (c == 58 && digits)		// 'number:'
          {
            if (discard) break;
            const n = input.slice(0,digits);
            let c = 'x';
            try { c = n.toString() } catch (_) {}
            const b = c|0;
            if (`${b}` === c)
              {
                if (input.byteLength < i+b) return;	// too short currently

                const e = i+1+b;
                const d = input.slice(i+1,e);
                input = input.slice(e);

                let s;
                try {
                  s = d.toString();
                } catch (_) {
                  console.error('cannot decode', e, 'bytes:', dump(d));
                  return process_input();
                }
                if (d[0] !== 123 || d[d.length-1] !== 125)	// not object
                  {
                    try {
                      s = JSON.parse(s);
                    } catch (_) {
                      console.error('invalid json', e, 'bytes:', dump(d));
                      return process_input();
                    }
                    process_input_data(s);
                  }
                else if (!DIRECT)
                  OUT('OB', s);
                return process_input();
              }
          }
        discard = i+1;
        digits = 0;
      }
    if (!discard)
      return;
    const murx = input.slice(0,discard);
    input = input.slice(discard+1);
    ERR('discarding', discard, 'bytes:', dump(murx));
    return process_input();
  }

ff.on('data', data =>
  {
    input = Buffer.concat([input, data]);
    process_input();
  });

let bye=1;
ff.on('close', () =>
  {
    process.stderr.write('TERMINATED\n');
    process.exit(bye);
  });

// Here we connect to the browser
// This probably should be a bit extended,
// such that we can use SSH tunnels, too.
// Feel free to improve for things like IP:port etc.
//
// BTW this is asynchronous, so wait for it here.
await P(ff, 'connect', port, '127.0.0.1');

// cookie: {key:value}
// .name (str)
// .value (str)
// .path="/" (str)
// .domain=origin (str)
// .secure=false (bool)
// .httpOnly=false (bool)
// .expiry (int) if not set it is a session cookie
// .sameSite="None" (str)

// script:
// .script (str) function body
// .args (array) function arguments
// .sandbox (str) sandbox to run in
//	If left away modifies the current context.
//	If "system" then equivalent to "chrome" context.
//	See .newSendbox
// .newSandbox (bool)
//	set to (false) to use previously used sandbox
//	set to (true) to run in a fresh sandbox
//	if undefined behavior usually is like (true), but this might vary across browsers
// .filename (str) filename to use in stacktraces
// .line (num) line number for filename

// search:
// .element (str) opt:start node
// .using (str) method
//	"class name"
//	"css selector"
//	"id"
//	"name"
//	"link text"
//	"partial link text"
//	"tag name"
//	"xpath"
// .value (str) searched value

// Aliases, because most of the commands are hard to remember.
// UPPERCASE usually sets while lowercase then gets
// opt: means optional parameters
const alias =
  { New:	'WebDriver:NewSession'		// Must be the first command, therefor implicitly done
  , Quit:	'Marionette:Quit'		// NEVER USE THIS, this closes the port and leaves FF in the void

  , ctx:	'Marionette:GetContext'		// - return current context
  , CTX:	'Marionette:SetContext'		// ctx (str): either "chrome" or "content"

  , win:	'WebDriver:GetWindowHandle'	// - get the current active top window/tab
  , WIN:	'WebDriver:SwitchToWindow'	// {handle,focus:true}
  , list:	'WebDriver:GetWindowHandles'	// - array of all window handles
  , type:	'Marionette:GetWindowType'
  , title:	'WebDriver:GetTitle'	
  , src:	'WebDriver:GetPageSource'	// - page source (HTML code)
  , url:	'WebDriver:GetCurrentURL'
  , URL:	'WebDriver:Navigate'		// {url}: set location to given URL
  , back:	'WebDriver:Back'
  , forward:	'WebDriver:Forward'
  , reload:	'WebDriver:Refresh'		// - reload page (forced reload not supported?)
  , min:	'WebDriver:MinimizeWindow'
  , max:	'WebDriver:MaximizeWindow'
  , full:	'WebDriver:FullscreenWindow'	// use POS to restore window position
  , pos:	'WebDriver:GetWindowRect'
  , POS:	'WebDriver:SetWindowRect'	// opt:{x,y,width,height}
  , 'new':	'WebDriver:NewWindow'		// opt:{focus:false,isPrivate:false,type:"tab"} "window" is the other type
  , close:	'WebDriver:CloseWindow'

  , cookies:	'WebDriver:GetCookies'
  , cookie:	'WebDriver:AddCookie'		// cookie
  , COOKIE:	'WebDriver:DeleteCookie'	// {name}
  //WebDriver:DeleteAllCookies must be explicitly called, this action is too dangerous to get some alias

  , find:	'WebDriver:FindElement'		// search {using:"id",value:"myid"} returns first {WebDriverMagic:id}
  , finds:	'WebDriver:FindElements'	// returns array of such elements
  , click:	'WebDriver:ElementClick'	// {id}
  , attr:	'WebDriver:GetElementAttribute'	// {id,name}
  , prop:	'WebDriver:GetElementProperty'	// {id,name}

  , exec:	'WebDriver:ExecuteAsyncScript'	// {script}
  , 'async':	'WebDriver:ExecuteScript'	// {script}: `callback(returnval)` function added to args at the end
  };

const SPECIAL =
  { ECHO(args) { console.log('ECHO', args); return args }
  , JSON(args) { return JSON.parse(args) }
  }

// Split line into token SPC rest
// return [ token, rest ]
const token = line =>
  {
    if (!line) return [];
    const i = line.indexOf(' ');
    return [ i>0 ? line.slice(0,i) : line , i>0 ? line.slice(i+1) : void 0 ];
  }

// Implements Command: ENV var selector
const getVar = {};
const setEnv = (s,req) =>
  {
    const [name,rest] = token(s);
    if (name[0] <'a' || name[0] >'z') throw `ENV ${name}: must start with lowercase letter a-z`;
    const fn = (() => {
      switch (rest)
        {
        // perhaps we should improve this to RegEx in future
        // it would be nice to have some real parser like jq
        case '=':			return _ => _;
        case '.':			return _ => _.value;
        case '= e': case void 0:	return _ => _.value[WebDriverMagic];
        case 'c':			return _ => _.length;
        case 'l':			return _ => _.length-1;
        case `${rest|0}`:		return _ => _[rest];
        case `${parseInt(rest)} e`:	return _ => _[parseInt(rest)][WebDriverMagic];
        default:
          throw `ENV ${name} ${rest}: unknown mode`;
        }
      })();

    const p = PO();
    getVar[name] = p.p;
    DEBUG('setEnv', name, rest);
    return req.p.then(_ => { const v = process.env[name] = getVar[name] = toJ(fn(_)); DEBUG('ENV', name, v); p.ok(v); return _ }, _ => { DEBUG('ENV', name, _); p.ko(_); throw _ });
  };

// Asynchronous Promise, returns object with all 3: {p:promise,ok:resolve,ko:reject}
const PO = () => { const o={}; o.p = new Promise((a,b) => { o.ok=a; o.ko=b }); return o }

let silent = DIRECT;	// when direct, the silence the first pack of messages
let SendID = 0;
let LastReq, LastOut = Promise.resolve();
const send = async line =>	// COMMAND JSON
  {
    const silenced = silent;
    const req	= PO();
    const out	= PO();

    const lOut	= LastOut;	// previous command was sent
    LastOut	= out.p;
    const lReq	= LastReq;	// previous command has answer
    LastReq	= req;

    pending.add(req.p);	// for Promise.allSettled(pending) below

    DEBUG('LINE', line);
    const [cmd,rest] = token(line);
    const ar = [];
    if (rest)
      {
        await lOut;	// wait until previous variables are processed

        // resolve the @name@ variables for a line
        const a = rest.split('@');
        while (a.length)
          {
            ar.push(a.shift());

            while (a.length)
              {
                const name = a.shift();
                if (name === '')
                  {
                    ar.push('@');
                    break;
                  }
                const t = getVar[name] || process.env[name];
                if (t !== void 0)
                  {
                    DEBUG('W', name, line);
                    ar.push(await t);		// Variables are asynchronous, wait for the value
                    DEBUG('C', name, line);
                    break;
                  }
                ar.push('@');			// wrong sequence or unknown variable, just leave as-is
                ar.push(name);
                // try the next '@'
              }
          }
      }

    // check for our local commands
    const args = ar.length ? ar.join('') : void 0;
    DEBUG('RUN:',cmd,args, lReq);
    const fn = SPECIAL[cmd];
    if (fn)
      {
        DEBUG(cmd, args);
        await lOut;			// synchronize, perhaps something is output in the command
        out.ok();			// nothing sent to browser, so go along
        req.ok(fn(args));		// hand out what the function returns
        return req.p;			// just in case you want to send().then(..)
      }

    if (cmd === 'ENV')
      {
        lOut.then(() => out.ok());	// taken from the previous output, so forward this state
        req.args = args;		// dummy, for debugging
        req.ok(setEnv(args, lReq));	// provide the variable (asynchronousy)
        return req.p;
      }

    // This is a command sent to the browser
    const sid	= ++SendID;		// this needs a fresh ID
    req.cmd	= cmd;			// for output (if not silenced)
    IDs[sid]	= req;			// track it for receive function

    // built what to send.
    // Either we have some JSON or send it as plain string
    // Sorry, is a bit hacky.
    const j = toJ([0,sid,alias[cmd] || cmd, args && (args.startsWith('{') || args.startsWith('[') || args.startsWith('"')) ? JSON.parse(args) : args]);

    await lOut;		// in case we did not wait above

    DEBUG('OUT:', j);
    ff.write(`${j.length}:${j}`);	// send it to browser

    out.ok();				// enable the next command in chain as soon as possible

    if (silenced)
      return req.p;			// return the future for the value in case you want to send().then(..

    // We are not silent, so present the result on STDOUT
    const KO = _ => { exit_code=1; OUT('KO', cmd, toJ(_)) };
    const OK = _ =>
      {
        const k = Object.keys(_);
        if (k.length === 1 && k[0] === 'value') _ = _.value;	// simplify .value returns
        if (Array.isArray(_) && _.length && _.filter(_ => { const s = `"${_}"`; return toJ(_) !== s || s.includes(' ') }).length === 0)
          return OUT('OK', cmd, ..._);		// array made fully of simple values
        const j = toJ(_);
        if (_ && _.constructor === String && `"${_}"` === j && !_.startsWith('[') && !_.startsWith('{'))	// " is \" in JSON
          return OUT('OK', cmd, _);		// return simple string
        return OUT('OK', cmd, j);		// return JSON
      }
    // If we are not silenced, we return the interpeted value
    return req.p.then(OK, KO);
  };

const sends = (...a) => a.map(send);

// I like things to be easy to understand
send('New');
if (!DIRECT) sends('ctx', 'win', 'type', 'title', 'url'); // , 'src');	complete document usually is a little too much

// We are no more silent from here.
// So commandline arguments give us output.
silent = false;
sends(...process.argv.slice(3));

const done = () => Promise.allSettled(pending);
let inEOF, exit_code = 0;
const EOF = async () =>
  {
    if (inEOF) return;
    inEOF = true;
    await done();
    if (!DIRECT) OUT('EOF');
    process.exit(exit_code);
  }

// Now the interactive stuff
isEOF.then(() => EOF());	// do not detect EOF before everything was sent out
await done();

if (DIRECT) EOF();		// we are noninteractive (commands are from commandline)
if (!inEOF)
  {
    // DIRECT === false
    // Usually not reached on </dev/null either.
    // However, this is a race condition (whatever is handled first first: all resonses or EOF).
    // Note that EOF is not detected as long as process.stdin is not tried
    OUT('DO');
    rl.on('line', send);
    rl.on('close', EOF);
    rl.prompt();
  }

})();


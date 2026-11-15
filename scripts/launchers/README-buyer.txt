ClipForge
=========

ClipForge is a video editor that runs in your web browser, on your own computer. You import clips, arrange, trim
and split them on a timeline with several video layers and audio tracks, preview the result, and export an MP4.
Nothing is uploaded anywhere: your videos stay on your machine.

Run it in three steps
---------------------

1. Unzip this folder somewhere (for example your Desktop or Documents). Do not run it from inside the zip file.
2. Start the launcher for your system:
     Windows:  double-click  start-windows.bat
     Mac:      double-click  start-mac.command
     Linux:    run           ./start-linux.sh   (or double-click it in your file manager)
3. Your browser opens ClipForge at http://localhost:8123. Keep the launcher window open while you edit. Close it
   (or press Ctrl+C) to stop.

The launcher needs either Python 3 (python.org) or Node.js (nodejs.org) installed. Nothing else is downloaded and
no internet connection is needed. If neither is found it says:
"Install Python 3 (python.org) or Node.js (nodejs.org), then run this again". Macs and most Linux systems already
have Python 3. If port 8123 is busy, set CLIPFORGE_PORT to another number before starting, then open that address.

Why a launcher? Browsers do not let this kind of app run when you simply open index.html from a folder, so the
launcher starts a tiny web server on your own computer (serve.py or serve.mjs in this folder; it only accepts
connections from your own computer) and the app runs from there.

Run it by hand
--------------

From inside this folder, either of these starts the server; then open http://localhost:8123 yourself:

  python3 serve.py
  node serve.mjs

Browser
-------

Use a Chromium-based desktop browser (Chrome or Edge). Safari untested. Phones and tablets are not supported.
ClipForge needs WebCodecs, WebGL2, Web Audio and writable browser file storage; if your browser lacks one, a banner
at the top of the page says which. Open ClipForge in one tab at a time.

Your projects and imported files are stored inside the browser, under the address http://localhost:8123. Use the
same address (same port) each time to see your project again, and do not clear the site's data in your browser
unless you mean to delete them.

"Windows protected your PC" / "unidentified developer" warnings
----------------------------------------------------------------

The launchers are plain text scripts and are not code-signed, so your system may warn before running them. You can
open them in a text editor to see exactly what they do.

  Windows: if SmartScreen shows "Windows protected your PC", click "More info", then "Run anyway".
  Mac:     if double-clicking says the file cannot be opened, right-click (or Control-click) start-mac.command,
           choose "Open", then click "Open" again in the dialog. If the file will not run at all, open Terminal,
           type "chmod +x " (with the trailing space), drag the file into the window, and press Return.
  Linux:   if the file will not run, make it executable with:  chmod +x start-linux.sh

Licence summary
---------------

Personal use on your own computers, one buyer, no redistribution or resale. The full text is in LICENSE.txt
(a draft pending legal review). Third-party software notices are in app/licenses/THIRD-PARTY.txt.

Version: see the VERSION file.

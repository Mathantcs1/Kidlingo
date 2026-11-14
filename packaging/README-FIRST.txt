CLIPFORGE (MVP): quick start
============================

ClipForge is a video editor that runs in your web browser. Your videos and projects stay on your own
computer: nothing is uploaded anywhere.

WHAT YOU NEED
  * A computer with the free Node.js "LTS" version installed: https://nodejs.org
  * The current desktop version of Google Chrome (the only browser this MVP has been tested in;
    other browsers may not work).

START IT
  Mac:      double-click  start-mac.command
            (first time only: if macOS blocks it, right-click the file > Open > Open)
  Windows:  double-click  start-windows.bat
  Linux:    run           ./start-linux.sh
  Your browser opens at http://localhost:5173 . Keep the black window open while you edit.
  To stop ClipForge, close that window (or press Ctrl+C).

  Always open ClipForge at http://localhost:5173 . Your projects are stored by the browser for that
  exact address, so a different address or port will look empty.

FIRST EDIT (2 minutes)
  1. Click Import and choose a video, image or audio file.
  2. Click the + next to it to put it on the timeline.
  3. Move the playhead, press S to split, Delete to remove a piece, Ctrl/Cmd+Z to undo.
  4. Click a clip and use Effect Controls (right side) for position, scale, animation and effects.
  5. Right-click clips, lanes and tracks for shortcuts. Open Help (top left) for a guide to every control.
  6. Click Export (top right) to render your video.

GOOD TO KNOW
  * This is an MVP that is still growing. Updates are delivered as a new download.
  * Projects are saved in your browser. Clearing your browser's site data for localhost:5173
    deletes them, so keep your original media files and exported videos safe.
  * Projects saved by a newer version cannot be opened by an older version.
  * Your files are never sent to a server by ClipForge.

FILES IN THIS FOLDER
  app/                the ClipForge program (do not edit)
  server.mjs          the tiny local server that runs it
  LICENSE-TERMS.txt   how you may use ClipForge
  app/licenses/       licences of the open-source parts used inside ClipForge

SUPPORT: [your support email or link]

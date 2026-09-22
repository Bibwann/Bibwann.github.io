const terminal = document.getElementById('terminal');
const output = document.getElementById('output');
const statsDiv = document.getElementById('stats');

const state = {
  cycles: 0,
  instructions: 0,
  tfops: 0,
  loopRunning: false,
  loopEfficiency: 1,
  compileEfficiency: 1,
  guiInstalled: false,
  loopInterval: null,
  lastCompileTime: 0,
  guiStage: 1,
  loopUnlocked: false,
  currentPath: '/home/user', // Répertoire de travail actuel
  fileSystem: {
    '/home/user': ['documents', 'downloads', 'instructions.txt'],
    '/home/user/documents': ['manual.txt', 'project_notes.txt'],
    '/home/user/downloads': ['core_update.zip', 'backup.tar'],
    '/home/user/instructions.txt': 'Instructions for unlocking the GUI and other system processes.'
  },
  sudoPassword: 'dev', // Mot de passe pour sudo
  rootAccess: false // Pour savoir si l'on est en mode root
};

let currentTyped = '';
let activeTypedElement = null;
let commandHistory = [];
let historyIndex = -1;

const availableCommands = [
  'compile core',
  'build',
  'build all',
  'status',
  'clear',
  'upgrade compile',
  'upgrade loop',
  'apt-get install gui',
  'launch gui',
  'run loop',
  'stop loop',
  'echo',
  'ls',
  'cd',
  'cat',
  'man',
  'help',
  'auto-build',
  'sudo -i'
];

function updateStatus() {
  statsDiv.innerText = `Cycles: ${state.cycles} | Instructions: ${state.instructions} | Ops: ${state.tfops}`;
}

function createInputLine() {
  const line = document.createElement('div');
  line.className = 'input-line';

  const prompt = document.createElement('span');
  prompt.className = 'prompt';
  prompt.textContent = state.rootAccess ? 'root@core:~$ ' : 'dev@core:~$ ';

  const typed = document.createElement('span');
  typed.className = 'typed-text';

  const cursor = document.createElement('span');
  cursor.className = 'cursor';
  cursor.textContent = '█';

  line.appendChild(prompt);
  line.appendChild(typed);
  line.appendChild(cursor);
  terminal.appendChild(line);
  terminal.scrollTop = terminal.scrollHeight;

  return { typed, line };
}

function writeOutput(text) {
  const block = document.createElement('div');
  block.className = 'output-line';
  block.innerText = text;
  terminal.appendChild(block);
  terminal.scrollTop = terminal.scrollHeight;
  trimTerminalLines();
}

function insertAbovePrompt(text) {
  const block = document.createElement('div');
  block.className = 'output-line';
  block.innerText = text;

  const promptLine = document.querySelector('.input-line');
  if (promptLine) {
    terminal.insertBefore(block, promptLine);
  } else {
    terminal.appendChild(block);
  }

  terminal.scrollTop = terminal.scrollHeight;
  trimTerminalLines();
}

function trimTerminalLines(maxLines = 100) {
  const lines = terminal.querySelectorAll('.output-line');
  if (lines.length > maxLines) {
    lines[0].remove();
  }
}

function handleCommand(command) {
  writeOutput(`dev@core:${state.currentPath} $ ${command}`);

  const now = Date.now();
  const cooldown = 3000;

  // Vérifie si la commande est 'sudo -i' pour activer le mode root
  if (command.startsWith('sudo -i')) {
    const password = command.split(' ')[2]; // Récupère le mot de passe de la commande
    if (password === state.sudoPassword) {
      if (!state.rootAccess) {
        writeOutput("Password correct. Switching to root...");
        state.rootAccess = true;
        updatePrompt();  // Met à jour le prompt pour afficher le mode root
      } else {
        writeOutput("You are already in root mode.");
      }
    } else {
      writeOutput("Incorrect password.");
    }
    return;  
  }

  switch (command) {
    case 'help':
      writeOutput("Available commands:\n- compile core\n- run loop\n- stop loop\n- build\n- build all\n- status\n- clear\n- upgrade compile\n- upgrade loop\n- apt-get install gui\n- launch gui\n- ls\n- cd\n- cat\n- man\n- auto-build\n- sudo -i");
      break;

    case 'compile core':
      if ((now - state.lastCompileTime < cooldown) || state.rootAccess) {
        const gain = 10 * state.compileEfficiency;
        state.cycles += gain;
        writeOutput(`+${gain} cycles generated.`);
        state.lastCompileTime = now;
      } else {
        writeOutput("Please wait before compiling again.");
      }
      break;

    case 'build':
      if ((state.cycles >= 20) || state.rootAccess) {
        state.cycles -= 20;
        state.instructions += 1;
        writeOutput("1 instruction compiled from 20 cycles.");
        checkChapterComplete();
      } else {
        writeOutput("Not enough cycles. Need 20.");
      }
      break;

    case 'build all':
      if ((state.cycles >= 20) || state.rootAccess) {
        state.cycles -= 20;
        state.instructions += 5;
        writeOutput("All resources built and processed in one go.");
        checkChapterComplete();
      } else {
        writeOutput("Not enough cycles to build everything. Need 20.");
      }
      break;

    case 'status':
      writeOutput(`Cycles: ${state.cycles}\nInstructions: ${state.instructions}\nOps: ${state.tfops}`);
      break;

    case 'clear':
      terminal.innerHTML = '';
      terminal.appendChild(statsDiv);
      break;

    case 'upgrade compile':
      if ((state.instructions >= 5) || state.rootAccess) {
        state.instructions -= 5;
        state.compileEfficiency++;
        writeOutput("Compile core upgraded: now generates more cycles.");
      } else {
        writeOutput("Need 5 instructions to upgrade compile core.");
      }
      break;

    case 'upgrade loop':
      if ((state.instructions >= 10) || state.rootAccess) {
        state.instructions -= 10;
        state.loopEfficiency++;
        writeOutput("Idle loop upgraded: now generates more cycles.");
      } else {
        writeOutput("Need 10 instructions to upgrade idle loop.");
      }
      break;

    case 'apt-get install gui':
      if (state.guiStage < 3 && !state.rootAccess) {
        writeOutput("The GUI is not yet unlocked. Keep progressing to unlock it.");
      } else if (state.instructions >= 200 || state.rootAccess) {
        state.instructions -= 200;
        state.guiInstalled = true;
        writeOutput("GUI package installed. You can now use 'launch gui'.");
      } else {
        writeOutput("Need 200 instructions to install GUI.");
      }
      break;

    case 'launch gui':
      if (state.guiInstalled) {
        writeOutput("Launching graphical interface...");
        localStorage.setItem('evo_chapter', 'ch2/ch2.html');
        setTimeout(() => {
          window.location.href = '../ch2/ch2.html';
        }, 2000);
      } else {
        writeOutput("GUI not installed. Use 'apt-get install gui' first.");
      }
      break;

    case 'run loop':
      if (!state.loopRunning && (state.instructions >= 2 || state.rootAccess)) {
        state.loopRunning = true;
        writeOutput("Idle loop started (generating cycles every 2s)...");

        state.loopInterval = setInterval(() => {
          const idleGain = 5 * state.loopEfficiency;
          state.cycles += idleGain;
          insertAbovePrompt(`+${idleGain} cycles (loop)`);
          updateStatus();
          checkChapterComplete();
        }, 2000);
      } else if (state.instructions < 2) {
        writeOutput("You need 2 instructions to unlock the loop.");
      } else {
        writeOutput("Loop already running.");
      }
      break;

    case 'stop loop':
      if (state.loopRunning && state.loopInterval) {
        clearInterval(state.loopInterval);
        state.loopRunning = false;
        state.loopInterval = null;
        writeOutput("Idle loop stopped.");
      } else {
        writeOutput("Idle loop is not running.");
      }
      break;

    case 'echo':
      writeOutput(currentTyped.split(" ").slice(1).join(" "));
      break;

    case 'ls':
      const currentDir = state.fileSystem[state.currentPath];
      if (currentDir) {
        writeOutput(currentDir.join(" "));
      } else {
        writeOutput("No such directory.");
      }
      break;

    case 'cd':
      const targetDir = command.split(" ")[1];
      if (state.fileSystem[state.currentPath + '/' + targetDir]) {
        state.currentPath += '/' + targetDir;
        writeOutput(`Changed directory to ${state.currentPath}`);
      } else {
        writeOutput(`No such directory: ${targetDir}`);
      }
      break;

    case 'cat':
      const fileName = command.split(" ")[1];
      const fileContent = state.fileSystem[state.currentPath + '/' + fileName];
      if (fileContent) {
        writeOutput(fileContent);
      } else {
        writeOutput(`No such file: ${fileName}`);
      }
      break;

    case 'man':
      writeOutput("Manual not found. Try 'help' instead.");
      break;

    default:
      writeOutput("Command not recognized. Type 'help' for available commands.");
  }

  updateStatus();
}

function checkChapterComplete() {
  if (state.instructions >= 100 && state.guiStage === 1) {
    writeOutput(">> You have reached Stage 2! You can now unlock GUI.");
    state.guiStage = 2;
  }

  if (state.instructions >= 200 && state.guiStage === 2) {
    writeOutput(">> All stages complete! You can now install the GUI. You find out that your sudo password is 'dev'");
    state.guiStage = 3;
  }

  if (state.instructions >= 200 && !state.guiInstalled) {
    writeOutput(">> Unlocking GUI...");
    state.guiInstalled = true;
    writeOutput("GUI package installed. You can now use 'launch gui'.");
  }
}

function updatePrompt() {
  const promptElement = document.querySelector('.prompt');
  promptElement.textContent = state.rootAccess ? `root@core:${state.currentPath} $` : `dev@core:${state.currentPath} $`;
}

function promptLine() {
  const { typed } = createInputLine();
  currentTyped = '';
  activeTypedElement = typed;
}

document.addEventListener('keydown', e => {
  if (!activeTypedElement) return;

  if (e.key === 'Enter') {
    const activeLine = activeTypedElement?.parentElement;
    if (activeLine) activeLine.remove();

    if (currentTyped.trim()) {
      commandHistory.unshift(currentTyped);
      if (commandHistory.length > 100) commandHistory.pop();
    }

    handleCommand(currentTyped);
    activeTypedElement = null;
    currentTyped = '';
    historyIndex = -1;
    promptLine();

  } else if (e.key === 'ArrowUp') {
    if (commandHistory.length > 0 && historyIndex < commandHistory.length - 1) {
      historyIndex++;
      currentTyped = commandHistory[historyIndex];
    }
  } else if (e.key === 'ArrowDown') {
    if (historyIndex > 0) {
      historyIndex--;
      currentTyped = commandHistory[historyIndex];
    } else {
      historyIndex = -1;
      currentTyped = '';
    }
  } else if (e.key === 'Backspace') {
    currentTyped = currentTyped.slice(0, -1);
  } else if (e.key.length === 1) {
    currentTyped += e.key;
  }

  if (activeTypedElement) {
    activeTypedElement.innerText = currentTyped;
    terminal.scrollTop = terminal.scrollHeight;
  }
});

updateStatus();
promptLine();

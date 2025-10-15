(() => {
  // Element references
  const starCanvas = document.getElementById('star-canvas');
  const introOverlay = document.getElementById('intro-overlay');
  const usernameInput = document.getElementById('username-input');
  const avatarInput = document.getElementById('avatar-input');
  const avatarPreview = document.getElementById('avatar-preview');
  const startBtn = document.getElementById('start-btn');
  const chatContainer = document.getElementById('chat-container');
  const messagesDiv = document.getElementById('messages');
  const onlineCount = document.getElementById('online-count');
  const onlineList = document.getElementById('online-list');
  const messageInput = document.getElementById('message-input');
  const attachBtn = document.getElementById('attach-btn');
  const imageInput = document.getElementById('image-input');
  const sendBtn = document.getElementById('send-btn');
  const attachPreviewDiv = document.getElementById('attachment-preview');
  const attachImgPreview = document.getElementById('attach-img-preview');
  const removeAttachBtn = document.getElementById('remove-attachment-btn');
  const typingIndicator = document.getElementById('typing-indicator');
  const settingsBtn = document.getElementById('settings-btn');
  const settingsModal = document.getElementById('settings-modal');
  const closeSettingsBtn = document.getElementById('close-settings-btn');
  const gradientSelect = document.getElementById('gradient-select');
  const bannerInput = document.getElementById('banner-input');
  const chatHeader = document.getElementById('chat-header');

  // State variables
  let socket;
  let currentUser = { username: '', avatar: '' };
  let onlineUsers = {};          // { socketId: {username, avatar} }
  let typingUsers = new Set();   // usernames currently typing

  // Load saved username/avatar from localStorage for convenience
  const savedName = localStorage.getItem('username');
  const savedAvatar = localStorage.getItem('avatar');
  if (savedName) {
    usernameInput.value = savedName;
    if (savedAvatar) {
      avatarPreview.src = savedAvatar;
      avatarPreview.style.display = 'block';
    }
  }

  // Apply saved theme and banner preferences from localStorage
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    document.body.classList.add(savedTheme);
    gradientSelect.value = savedTheme;
  } else {
    // Default theme if none saved
    document.body.classList.add('theme-default');
  }
  const savedBanner = localStorage.getItem('banner');
  if (savedBanner) {
    chatHeader.style.backgroundImage = `url(${savedBanner})`;
    chatHeader.classList.add('has-banner');
  }

  // Initialize starfield background
  const ctx = starCanvas.getContext('2d');
  let stars = [];
  let starAnimationFrame;
  function initStars() {
    // Set canvas to full window size (handle high-DPI screens)
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ratio = window.devicePixelRatio || 1;
    starCanvas.width = w * ratio;
    starCanvas.height = h * ratio;
    starCanvas.style.width = w + 'px';
    starCanvas.style.height = h + 'px';
    ctx.scale(ratio, ratio);
    // Create random stars
    const numStars = Math.floor((w * h) / 5000);
    stars = [];
    for (let i = 0; i < numStars; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        radius: Math.random() * 1.2 + 0.3,      // star radius between 0.3 and 1.5
        brightness: Math.random(),              // initial brightness (0 to 1)
        twinkleFactor: Math.random() * 0.02     // magnitude of brightness change per frame
      });
    }
  }
  function animateStars() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (let star of stars) {
      // Randomly adjust brightness for twinkle effect
      star.brightness += (Math.random() - 0.5) * star.twinkleFactor;
      if (star.brightness < 0) star.brightness = 0;
      if (star.brightness > 1) star.brightness = 1;
      // Draw star (as a small circle)
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness})`;
      ctx.fill();
    }
    starAnimationFrame = requestAnimationFrame(animateStars);
  }
  // Start starfield animation
  initStars();
  animateStars();
  // Re-initialize stars on window resize
  window.addEventListener('resize', () => {
    cancelAnimationFrame(starAnimationFrame);
    initStars();
    animateStars();
  });

  // Avatar file input preview
  avatarInput.addEventListener('change', () => {
    const file = avatarInput.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = e => {
        avatarPreview.src = e.target.result;
        avatarPreview.style.display = 'block';
      };
      reader.readAsDataURL(file);
    }
  });

  // "Start Chatting" button handler
  startBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    if (!username) {
      alert('Please enter a username');
      return;
    }
    currentUser.username = username;
    localStorage.setItem('username', username);
    // Handle avatar upload (if a file is chosen)
    const avatarFile = avatarInput.files[0];
    if (avatarFile) {
      const formData = new FormData();
      formData.append('image', avatarFile);
      // Upload avatar to server to get a URL
      fetch('/upload', { method: 'POST', body: formData })
        .then(res => res.json())
        .then(data => {
          if (data && data.url) {
            currentUser.avatar = data.url;
            localStorage.setItem('avatar', data.url);
          }
          connectSocket();  // proceed to connect after uploading
        })
        .catch(err => {
          console.error('Avatar upload failed:', err);
          connectSocket();  // even if upload fails, proceed without avatar
        });
    } else {
      connectSocket();
    }
  });

  // Connect to Socket.IO and set up event handlers
  function connectSocket() {
    introOverlay.style.display = 'none';
    chatContainer.style.display = 'flex';
    socket = io();  // connect to socket.io server

    // Send join event with user info
    socket.emit('join', { username: currentUser.username, avatar: currentUser.avatar });

    // Receive chat history (if provided by server)
    socket.on('history', (messages) => {
      messages.forEach(msg => addMessage(msg, true));
      scrollMessagesToBottom();
    });
    // Receive current online users list (if provided)
    socket.on('onlineUsers', (users) => {
      onlineUsers = {};
      users.forEach(user => {
        onlineUsers[user.id] = { username: user.username, avatar: user.avatar };
      });
      renderOnlineUsers();
    });
    // Alternatively, handle combined init payload
    socket.on('init', (data) => {
      if (data.users) {
        onlineUsers = {};
        data.users.forEach(user => {
          onlineUsers[user.id] = { username: user.username, avatar: user.avatar };
        });
        renderOnlineUsers();
      }
      if (data.messages) {
        data.messages.forEach(msg => addMessage(msg, true));
        scrollMessagesToBottom();
      }
    });

    // New message from server
    socket.on('chat message', (msg) => {
      addMessage(msg);
    });
    // A new user joined
    socket.on('user joined', (user) => {
      onlineUsers[user.id] = { username: user.username, avatar: user.avatar };
      renderOnlineUsers();
      // (Optionally, could display a system message that user joined)
    });
    // A user left
    socket.on('user left', (id) => {
      if (onlineUsers[id]) {
        delete onlineUsers[id];
        renderOnlineUsers();
        // (Optionally, could display a system message that user left)
      }
    });
    // Another user is typing
    socket.on('typing', (user) => {
      if (!user || !user.username) return;
      if (user.id === socket.id) return;  // ignore own typing event if echoed
      typingUsers.add(user.username);
      updateTypingIndicator();
    });
    socket.on('stop typing', (user) => {
      if (!user || !user.username) return;
      typingUsers.delete(user.username);
      updateTypingIndicator();
    });
  }

  // Update online users header display
  function renderOnlineUsers() {
    const count = Object.keys(onlineUsers).length;
    onlineCount.textContent = `${count} online`;
    onlineList.innerHTML = '';
    for (let id in onlineUsers) {
      const { username, avatar } = onlineUsers[id];
      if (avatar) {
        // Use image avatar
        const img = document.createElement('img');
        img.src = avatar;
        img.alt = username;
        img.title = username;
        img.className = 'user-avatar';
        onlineList.appendChild(img);
      } else {
        // Use initial letter avatar with generated background color
        const letterDiv = document.createElement('div');
        letterDiv.textContent = username.charAt(0).toUpperCase();
        letterDiv.title = username;
        letterDiv.className = 'user-avatar avatar-letter';
        letterDiv.style.backgroundColor = stringToColor(username);
        onlineList.appendChild(letterDiv);
      }
    }
  }

  // Helper: generate a consistent color from a string (used for letter avatars)
  function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `hsl(${hue}, 50%, 50%)`;
  }

  // Add a message to the chat feed
  function addMessage(msg, isHistory = false) {
    const messageElem = document.createElement('div');
    messageElem.classList.add('message');
    const isMine = (msg.username === currentUser.username);
    messageElem.classList.add(isMine ? 'mine' : 'other');

    // Create avatar element (image or letter)
    let avatarElem;
    if (msg.avatar) {
      avatarElem = document.createElement('img');
      avatarElem.src = msg.avatar;
      avatarElem.alt = msg.username;
      avatarElem.className = 'user-avatar';
    } else {
      avatarElem = document.createElement('div');
      avatarElem.textContent = msg.username ? msg.username.charAt(0).toUpperCase() : '?';
      avatarElem.className = 'user-avatar avatar-letter';
      avatarElem.style.backgroundColor = stringToColor(msg.username || '');
    }
    avatarElem.title = msg.username;
    // Message body (container for name, text, image)
    const bodyElem = document.createElement('div');
    bodyElem.classList.add('message-body');
    // If this is someone else's message, add name label
    if (!isMine && msg.username) {
      const nameElem = document.createElement('div');
      nameElem.classList.add('message-user');
      nameElem.textContent = msg.username;
      bodyElem.appendChild(nameElem);
    }
    // Message bubble content
    const bubbleElem = document.createElement('div');
    bubbleElem.classList.add('message-bubble');
    // Append image (if any) first, then text (so text acts as caption under image)
    if (msg.image) {
      const imageElem = document.createElement('img');
      imageElem.src = msg.image;
      imageElem.alt = 'attachment';
      imageElem.classList.add('message-image');
      bubbleElem.appendChild(imageElem);
    }
    if (msg.text) {
      const textElem = document.createElement('div');
      textElem.classList.add('message-text');
      textElem.textContent = msg.text;
      bubbleElem.appendChild(textElem);
    }
    // Timestamp (if provided by server)
    if (msg.time) {
      const timeElem = document.createElement('div');
      timeElem.classList.add('timestamp');
      const date = new Date(msg.time);
      const hours = date.getHours();
      const minutes = date.getMinutes();
      const hh = hours % 12 || 12;
      const mm = minutes < 10 ? '0' + minutes : minutes;
      const ampm = hours >= 12 ? 'PM' : 'AM';
      timeElem.textContent = `${hh}:${mm} ${ampm}`;
      bubbleElem.appendChild(timeElem);
    }
    bodyElem.appendChild(bubbleElem);

    // Assemble message elements
    messageElem.appendChild(avatarElem);
    messageElem.appendChild(bodyElem);
    messagesDiv.appendChild(messageElem);

    // Auto-scroll to bottom for new messages
    if (!isHistory) {
      scrollMessagesToBottom();
    }
  }

  // Scroll the chat message area to the bottom
  function scrollMessagesToBottom() {
    const chatMain = document.getElementById('chat-main');
    chatMain.scrollTop = chatMain.scrollHeight;
  }

  // Update the typing indicator text based on current typers
  function updateTypingIndicator() {
    if (typingUsers.size === 0) {
      typingIndicator.style.display = 'none';
      typingIndicator.textContent = '';
    } else {
      const names = Array.from(typingUsers);
      let text;
      if (names.length === 1) {
        text = `${names[0]} is typing...`;
      } else if (names.length === 2) {
        text = `${names[0]} and ${names[1]} are typing...`;
      } else {
        text = `${names[0]}, ${names[1]}, and others are typing...`;
      }
      typingIndicator.textContent = text;
      typingIndicator.style.display = 'block';
    }
  }

  // Send a message (text and/or image attachment)
  function sendMessage() {
    const text = messageInput.value.trim();
    const file = imageInput.files[0];
    if (!text && !file) {
      return;  // nothing to send
    }
    if (file) {
      // If an image is attached, upload it first to get URL
      const formData = new FormData();
      formData.append('image', file);
      fetch('/upload', { method: 'POST', body: formData })
        .then(res => res.json())
        .then(data => {
          const imageUrl = data && data.url ? data.url : '';
          // Emit message with image URL (and text if any)
          const msgData = { username: currentUser.username, avatar: currentUser.avatar };
          if (text) msgData.text = text;
          if (imageUrl) msgData.image = imageUrl;
          socket.emit('chat message', msgData);
          // Clear composer fields
          messageInput.value = '';
          imageInput.value = ''; 
          attachPreviewDiv.style.display = 'none';
          attachImgPreview.src = '';
          stopTyping();
        })
        .catch(err => {
          console.error('Image upload failed:', err);
        });
    } else {
      // Text-only message
      const msgData = { username: currentUser.username, avatar: currentUser.avatar, text: text };
      socket.emit('chat message', msgData);
      messageInput.value = '';
      stopTyping();
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  // Send on Enter key within the message input
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    } else {
      // Notify typing on any other key press
      notifyTyping();
    }
  });
  messageInput.addEventListener('keyup', (e) => {
    if (e.key !== 'Enter') {
      if (messageInput.value === '') {
        // If input cleared, stop typing notification
        stopTyping();
      }
    }
  });

  // Typing indicator helpers
  let typing = false;
  let typingTimeout;
  function notifyTyping() {
    if (!typing) {
      typing = true;
      socket.emit('typing');
    }
    // Reset the timeout on every keystroke
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      if (typing) {
        stopTyping();
      }
    }, 500);
  }
  function stopTyping() {
    if (typing) {
      typing = false;
      socket.emit('stop typing');
    }
  }

  // Attachment controls
  attachBtn.addEventListener('click', () => {
    imageInput.click();
  });
  imageInput.addEventListener('change', () => {
    const file = imageInput.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = e => {
        attachImgPreview.src = e.target.result;
        attachPreviewDiv.style.display = 'block';
      };
      reader.readAsDataURL(file);
    } else {
      // No file (file picker canceled)
      attachPreviewDiv.style.display = 'none';
      attachImgPreview.src = '';
    }
  });
  removeAttachBtn.addEventListener('click', () => {
    imageInput.value = '';
    attachPreviewDiv.style.display = 'none';
    attachImgPreview.src = '';
  });

  // Settings modal behavior
  settingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'flex';
  });
  closeSettingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });
  // Close settings if clicking outside the modal content
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.style.display = 'none';
    }
  });
  // Theme selection change
  gradientSelect.addEventListener('change', () => {
    const themeClass = gradientSelect.value;
    document.body.classList.remove('theme-default', 'theme-blue', 'theme-purple', 'theme-green');
    document.body.classList.add(themeClass);
    localStorage.setItem('theme', themeClass);
  });
  // Banner image upload
  bannerInput.addEventListener('change', () => {
    const file = bannerInput.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = e => {
        const dataURL = e.target.result;
        chatHeader.style.backgroundImage = `url(${dataURL})`;
        chatHeader.classList.add('has-banner');
        localStorage.setItem('banner', dataURL);
      };
      reader.readAsDataURL(file);
    }
  });
})();

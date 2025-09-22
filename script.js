document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const uploader = document.getElementById('uploader');
    const dropZone = document.querySelector('.border-dashed');
    const fileNameDisplay = document.getElementById('file-name');
    const formatSelect = document.getElementById('format-select');
    const convertBtn = document.getElementById('convert-btn');
    const statusContainer = document.getElementById('status-container');
    const statusMessage = document.getElementById('status-message');
    const progressBar = document.getElementById('progress-bar');
    const downloadContainer = document.getElementById('download-container');
    const downloadLink = document.getElementById('download-link');

    // Quality selectors
    const mp3QualityContainer = document.getElementById('mp3-quality-container');
    const mp3QualitySelect = document.getElementById('mp3-quality-select');
    const aacM4aQualityContainer = document.getElementById('aac-m4a-quality-container');
    const aacM4aQualitySelect = document.getElementById('aac-m4a-quality-select');
    const oggQualityContainer = document.getElementById('ogg-quality-container');
    const oggQualitySelect = document.getElementById('ogg-quality-select');

    let inputFile = null;

    // --- FFmpeg Setup (using newer v0.12 API) ---
    const { FFmpeg } = window.FFmpeg; // Correctly reference the global FFmpeg object
    const { fetchFile } = FFmpegUtil;
    const ffmpeg = new FFmpeg({ log: true });

    // --- UI Logic ---
    const updateQualitySelectors = () => {
        const selectedFormat = formatSelect.value;
        // Hide all quality selectors first
        mp3QualityContainer.style.display = 'none';
        aacM4aQualityContainer.style.display = 'none';
        oggQualityContainer.style.display = 'none';

        // Show the relevant one based on the selected format
        switch (selectedFormat) {
            case 'mp3':
                mp3QualityContainer.style.display = 'block';
                break;
            case 'aac':
            case 'm4a':
                aacM4aQualityContainer.style.display = 'block';
                break;
            case 'ogg':
                oggQualityContainer.style.display = 'block';
                break;
        }
    };

    // --- Event Listeners ---
    uploader.addEventListener('change', (e) => {
        handleFileSelect(e.target.files);
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drop-zone-over');
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drop-zone-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drop-zone-over');
        handleFileSelect(e.dataTransfer.files);
    });

    const handleFileSelect = (files) => {
        if (files.length > 0) {
            inputFile = files[0];
            fileNameDisplay.textContent = inputFile.name;
        }
    };

    formatSelect.addEventListener('change', updateQualitySelectors);

    convertBtn.addEventListener('click', async () => {
        if (!inputFile) {
            // Using a more user-friendly message display instead of an alert.
            statusMessage.textContent = "Please select a file first.";
            statusContainer.classList.remove('hidden');
            return;
        }
        await convertAudio();
    });

    // Initial UI setup on page load
    updateQualitySelectors();

    // --- Core Conversion Logic ---
    const convertAudio = async () => {
        // 1. UI Setup for conversion start
        convertBtn.disabled = true;
        downloadContainer.classList.add('hidden');
        statusContainer.classList.remove('hidden');
        statusMessage.textContent = 'Starting conversion...';
        progressBar.style.width = '0%';
        progressBar.style.backgroundColor = '#4f46e5'; // Reset progress bar color

        const outputFormat = formatSelect.value;
        const originalFileName = inputFile.name.split('.').slice(0, -1).join('.');
        const inputFileName = inputFile.name;
        const outputFileName = `${originalFileName}.${outputFormat}`;

        console.log(`Starting conversion to ${outputFormat}`);

        try {
            // 2. Load FFmpeg if it's not already loaded
            if (!ffmpeg.loaded) {
                statusMessage.textContent = 'Loading FFmpeg core...';
                const coreURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/ffmpeg-core.js';
                await ffmpeg.load({
                    coreURL,
                    wasmURL: 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/ffmpeg-core.wasm',
                    workerURL: 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/ffmpeg-core.worker.js'
                });
            }

            // 3. Write the uploaded file to FFmpeg's virtual file system
            statusMessage.textContent = 'Writing file to memory...';
            await ffmpeg.writeFile(inputFileName, await fetchFile(inputFile));

            // 4. Set up progress tracking to update the progress bar
            ffmpeg.on('progress', ({ progress }) => {
                const p = Math.round(progress * 100);
                if (p >= 0 && p <= 100) {
                     progressBar.style.width = `${p}%`;
                     statusMessage.textContent = `Converting... ${p}%`;
                }
            });

            // 5. Build the FFmpeg command array with appropriate quality flags
            console.log('Building and running FFmpeg command...');
            const command = ['-i', inputFileName];

            switch (outputFormat) {
                case 'mp3':
                    command.push('-b:a', mp3QualitySelect.value);
                    break;
                case 'aac':
                case 'm4a':
                    command.push('-b:a', aacM4aQualitySelect.value);
                    break;
                case 'ogg':
                    // OGG uses a quality scale (-q:a) instead of bitrate
                    command.push('-q:a', oggQualitySelect.value);
                    break;
            }

            command.push(outputFileName);

            await ffmpeg.exec(command);

            // 6. Finalize progress and read the converted file from the virtual file system
            progressBar.style.width = '100%';
            statusMessage.textContent = 'Finalizing...';
            const data = await ffmpeg.readFile(outputFileName);

            // 7. Create a downloadable link for the converted file
            const blob = new Blob([data.buffer], { type: `audio/${outputFormat}` });
            const url = URL.createObjectURL(blob);

            downloadLink.href = url;
            downloadLink.download = outputFileName;

            // 8. Update UI to show the download button
            statusContainer.classList.add('hidden');
            downloadContainer.classList.remove('hidden');
            console.log('Conversion successful!');

            downloadLink.addEventListener('click', () => {
                setTimeout(() => {
                    resetUI();
                }, 1000);
            });

        } catch (error) {
            handleConversionError(error);
        } finally {
            // 9. Re-enable the convert button regardless of success or failure
            convertBtn.disabled = false;
        }
    };

    const resetUI = () => {
        inputFile = null;
        fileNameDisplay.textContent = 'MP3, WAV, M4A, FLAC, OGG, AAC';
        downloadContainer.classList.add('hidden');
        progressBar.style.width = '0%';
        uploader.value = ''; // Clear the file input
    };

    const handleConversionError = (error) => {
        console.error('An error occurred during conversion:', error);
        progressBar.style.backgroundColor = '#ef4444'; // Red for error

        let friendlyMessage = 'An unknown error occurred during conversion.';
        if (error.message) {
            if (error.message.includes('Out of memory')) {
                friendlyMessage = 'Error: Out of memory. The file might be too large. Please try a smaller file or reload the page.';
            } else if (error.message.includes('Invalid data found when processing input')) {
                friendlyMessage = 'Error: The input file seems to be corrupted or in an unsupported format.';
            } else {
                friendlyMessage = 'An unexpected error occurred. Please check the file and try again.';
            }
        }

        statusMessage.textContent = friendlyMessage;
    };
});

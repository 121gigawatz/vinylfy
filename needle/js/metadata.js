/**
 * Metadata Handler for Vinylfy
 * Handles reading and writing audio file metadata (ID3 tags)
 */

// Load jsmediatags from UNPKG (browser-compatible build)
let jsmediatags = null;
const jsmediatagsReady = (async () => {
  // Load the script dynamically
  const script = document.createElement('script');
  script.src = 'https://unpkg.com/jsmediatags@3.9.5/dist/jsmediatags.min.js';
  document.head.appendChild(script);

  // Wait for script to load
  await new Promise((resolve) => {
    script.onload = resolve;
  });

  // Get the global jsmediatags object
  jsmediatags = window.jsmediatags;
})();

/**
 * Extract metadata from an audio file
 * @param {File} file - The audio file to extract metadata from
 * @returns {Promise<Object>} - Extracted metadata
 */
export async function extractMetadata(file) {
  // Ensure jsmediatags is loaded
  await jsmediatagsReady;

  return new Promise((resolve) => {
    jsmediatags.read(file, {
      onSuccess: (tag) => {
        const tags = tag.tags;

        // Normalize the metadata structure
        const metadata = {
          title: tags.title || '',
          artist: tags.artist || '',
          album: tags.album || '',
          year: tags.year || '',
          genre: tags.genre || '',
          comment: tags.comment?.text || tags.comment || '',
          track: tags.track || '',
          albumArtist: tags.album_artist || tags.TPE2?.data || '',
          composer: tags.composer || tags.TCOM?.data || '',

          // Additional fields
          picture: tags.picture || null,

          // Raw tags for debugging
          raw: tags
        };

        console.log('Extracted metadata:', metadata);
        resolve(metadata);
      },
      onError: (error) => {
        console.warn('Failed to extract metadata:', error);
        // Resolve with empty metadata instead of rejecting
        resolve({
          title: '',
          artist: '',
          album: '',
          year: '',
          genre: '',
          comment: '',
          track: '',
          albumArtist: '',
          composer: '',
          picture: null,
          raw: null
        });
      }
    });
  });
}

/**
 * Write metadata to an audio file
 * Supports: MP3 (ID3v2), FLAC (Vorbis Comments), AAC/M4A (MP4 atoms)
 * @param {Blob} audioBlob - The processed audio file as a blob
 * @param {Object} metadata - Metadata to write
 * @param {string} format - Audio format (mp3, flac, aac, m4a)
 * @returns {Promise<Blob>} - Audio file with metadata
 */
export async function writeMetadata(audioBlob, metadata, format = 'mp3') {
  const formatLower = format.toLowerCase();

  if (formatLower === 'mp3') {
    return await writeMP3Metadata(audioBlob, metadata);
  } else if (formatLower === 'flac') {
    return await writeFLACMetadata(audioBlob, metadata);
  } else if (formatLower === 'aac' || formatLower === 'm4a') {
    return await writeAACMetadata(audioBlob, metadata);
  } else {
    console.warn(`Metadata writing not supported for format: ${format}`);
    return audioBlob;
  }
}

/**
 * Write MP3 metadata using ID3v2 tags
 */
async function writeMP3Metadata(audioBlob, metadata) {
  // Import browser-id3-writer dynamically (v6 uses named export, not default)
  const { ID3Writer } = await import('https://cdn.jsdelivr.net/npm/browser-id3-writer@6.1.0/dist/browser-id3-writer.mjs');

  // Convert blob to ArrayBuffer
  const arrayBuffer = await audioBlob.arrayBuffer();
  const writer = new ID3Writer(arrayBuffer);

  // Set metadata tags
  if (metadata.title) writer.setFrame('TIT2', metadata.title);
  if (metadata.artist) writer.setFrame('TPE1', [metadata.artist]);
  if (metadata.album) writer.setFrame('TALB', metadata.album);
  if (metadata.year) writer.setFrame('TYER', metadata.year);
  if (metadata.genre) writer.setFrame('TCON', [metadata.genre]);
  if (metadata.comment) writer.setFrame('COMM', {
    description: '',
    text: metadata.comment
  });
  if (metadata.track) writer.setFrame('TRCK', metadata.track);
  if (metadata.albumArtist) writer.setFrame('TPE2', metadata.albumArtist);
  if (metadata.composer) writer.setFrame('TCOM', [metadata.composer]);

  // Add album artwork if available
  if (metadata.picture) {
    writer.setFrame('APIC', {
      type: 3, // Cover (front)
      data: metadata.picture.data,
      description: 'Cover'
    });
  }

  // Note: TENC frame (Encoded by) is not supported by browser-id3-writer
  // Skipping "Processed by Vinylfy" tag for MP3

  writer.addTag();

  // Use getBlob() method instead of manually creating blob
  // This ensures proper handling of the tagged audio data
  return writer.getBlob();
}

/**
 * Write FLAC metadata using Vorbis Comments
 */
async function writeFLACMetadata(audioBlob, metadata) {
  try {
    // Import FLACMetadataEditor dynamically
    const module = await import('https://cdn.jsdelivr.net/gh/AHOHNMYC/FLACMetadataEditor@master/src/flac_metadata_editor.min.js');
    const FLACMetadataEditor = module.default;

    const arrayBuffer = await audioBlob.arrayBuffer();
    const flac = new FLACMetadataEditor(arrayBuffer);

    // Set Vorbis comment tags (FLAC standard)
    if (metadata.title) flac.setTag('TITLE', metadata.title);
    if (metadata.artist) flac.setTag('ARTIST', metadata.artist);
    if (metadata.album) flac.setTag('ALBUM', metadata.album);
    if (metadata.year) flac.setTag('DATE', metadata.year);
    if (metadata.genre) flac.setTag('GENRE', metadata.genre);
    if (metadata.comment) flac.setTag('COMMENT', metadata.comment);
    if (metadata.track) flac.setTag('TRACKNUMBER', metadata.track);
    if (metadata.albumArtist) flac.setTag('ALBUMARTIST', metadata.albumArtist);
    if (metadata.composer) flac.setTag('COMPOSER', metadata.composer);

    // Add "Processed by Vinylfy" tag
    flac.setTag('ENCODER', 'Vinylfy - https://github.com/121gigawatz/vinylfy-app');

    // Add album artwork if available
    if (metadata.picture && metadata.picture.data) {
      const pictureData = {
        pictureType: 3, // Cover (front)
        mimeType: metadata.picture.format || 'image/jpeg',
        description: 'Cover',
        width: 0,
        height: 0,
        bitsPerPixel: 0,
        colors: 0,
        pictureData: metadata.picture.data
      };
      flac.addPicture(pictureData);
    }

    // Serialize back to ArrayBuffer
    const newArrayBuffer = flac.serialize();
    return new Blob([newArrayBuffer], { type: 'audio/flac' });
  } catch (error) {
    console.error('Failed to write FLAC metadata:', error);
    console.warn('Returning original FLAC file without metadata changes');
    return audioBlob;
  }
}

/**
 * Write AAC/M4A metadata using MP4 atoms (iTunes-style metadata)
 */
async function writeAACMetadata(audioBlob, metadata) {
  try {
    const arrayBuffer = await audioBlob.arrayBuffer();

    // Parse MP4 structure and find/create metadata atoms
    const mp4Data = new Uint8Array(arrayBuffer);

    // Create iTunes-style metadata atoms
    const metadataAtoms = createMP4Metadata(metadata);

    // Find moov atom and insert/replace udta atom
    const newMP4 = insertMP4Metadata(mp4Data, metadataAtoms);

    return new Blob([newMP4], { type: 'audio/mp4' });
  } catch (error) {
    console.error('Failed to write AAC/M4A metadata:', error);
    console.warn('Returning original AAC/M4A file without metadata changes');
    return audioBlob;
  }
}

/**
 * Create MP4 metadata atoms (ilst atom with iTunes-style tags)
 */
function createMP4Metadata(metadata) {
  const atoms = [];

  // iTunes metadata atom types
  if (metadata.title) atoms.push(createDataAtom('©nam', metadata.title));
  if (metadata.artist) atoms.push(createDataAtom('©ART', metadata.artist));
  if (metadata.album) atoms.push(createDataAtom('©alb', metadata.album));
  if (metadata.year) atoms.push(createDataAtom('©day', metadata.year));
  if (metadata.genre) atoms.push(createDataAtom('©gen', metadata.genre));
  if (metadata.comment) atoms.push(createDataAtom('©cmt', metadata.comment));
  if (metadata.albumArtist) atoms.push(createDataAtom('aART', metadata.albumArtist));
  if (metadata.composer) atoms.push(createDataAtom('©wrt', metadata.composer));

  // Track number (special format)
  if (metadata.track) {
    const trackNum = parseInt(metadata.track) || 0;
    atoms.push(createTrackAtom(trackNum));
  }

  // Encoder/software
  atoms.push(createDataAtom('©too', 'Vinylfy - https://github.com/121gigawatz/vinylfy-app'));

  // Album artwork
  if (metadata.picture && metadata.picture.data) {
    atoms.push(createCoverAtom(metadata.picture));
  }

  // Create ilst atom containing all metadata
  return createIlstAtom(atoms);
}

/**
 * Create MP4 data atom
 */
function createDataAtom(type, value) {
  const encoder = new TextEncoder();
  const valueBytes = encoder.encode(value);

  // data atom: size(4) + 'data'(4) + version/flags(4) + reserved(4) + value
  const dataAtomSize = 16 + valueBytes.length;
  const dataAtom = new Uint8Array(dataAtomSize);
  const view = new DataView(dataAtom.buffer);

  // Size
  view.setUint32(0, dataAtomSize, false);
  // 'data'
  dataAtom.set(encoder.encode('data'), 4);
  // Version (1 byte) + flags (3 bytes) - 0x00000001 = UTF-8 text
  view.setUint32(8, 0x00000001, false);
  // Reserved
  view.setUint32(12, 0, false);
  // Value
  dataAtom.set(valueBytes, 16);

  // Container atom: size(4) + type(4) + data atom
  const containerSize = 8 + dataAtomSize;
  const container = new Uint8Array(containerSize);
  const containerView = new DataView(container.buffer);

  containerView.setUint32(0, containerSize, false);
  container.set(encoder.encode(type), 4);
  container.set(dataAtom, 8);

  return container;
}

/**
 * Create track number atom
 */
function createTrackAtom(trackNum) {
  const encoder = new TextEncoder();

  // trkn data: 2 bytes reserved + 2 bytes track + 2 bytes total + 2 bytes reserved
  const trackData = new Uint8Array(8);
  const view = new DataView(trackData.buffer);
  view.setUint16(2, trackNum, false); // Track number at offset 2

  // data atom
  const dataAtomSize = 16 + trackData.length;
  const dataAtom = new Uint8Array(dataAtomSize);
  const dataView = new DataView(dataAtom.buffer);

  dataView.setUint32(0, dataAtomSize, false);
  dataAtom.set(encoder.encode('data'), 4);
  dataView.setUint32(8, 0x00000000, false); // Binary data flag
  dataView.setUint32(12, 0, false);
  dataAtom.set(trackData, 16);

  // Container
  const containerSize = 8 + dataAtomSize;
  const container = new Uint8Array(containerSize);
  const containerView = new DataView(container.buffer);

  containerView.setUint32(0, containerSize, false);
  container.set(encoder.encode('trkn'), 4);
  container.set(dataAtom, 8);

  return container;
}

/**
 * Create cover art atom
 */
function createCoverAtom(picture) {
  const encoder = new TextEncoder();
  const imageData = new Uint8Array(picture.data);

  // Determine image type (13 = PNG, 14 = JPEG)
  const imageType = picture.format === 'image/png' ? 13 : 14;

  // data atom
  const dataAtomSize = 16 + imageData.length;
  const dataAtom = new Uint8Array(dataAtomSize);
  const dataView = new DataView(dataAtom.buffer);

  dataView.setUint32(0, dataAtomSize, false);
  dataAtom.set(encoder.encode('data'), 4);
  dataView.setUint32(8, imageType, false);
  dataView.setUint32(12, 0, false);
  dataAtom.set(imageData, 16);

  // Container
  const containerSize = 8 + dataAtomSize;
  const container = new Uint8Array(containerSize);
  const containerView = new DataView(container.buffer);

  containerView.setUint32(0, containerSize, false);
  container.set(encoder.encode('covr'), 4);
  container.set(dataAtom, 8);

  return container;
}

/**
 * Create ilst atom containing all metadata atoms
 */
function createIlstAtom(atoms) {
  const encoder = new TextEncoder();

  // Calculate total size
  let totalSize = 8; // ilst header
  for (const atom of atoms) {
    totalSize += atom.length;
  }

  const ilst = new Uint8Array(totalSize);
  const view = new DataView(ilst.buffer);

  // Size
  view.setUint32(0, totalSize, false);
  // 'ilst'
  ilst.set(encoder.encode('ilst'), 4);

  // Add all atoms
  let offset = 8;
  for (const atom of atoms) {
    ilst.set(atom, offset);
    offset += atom.length;
  }

  return ilst;
}

/**
 * Insert metadata into MP4 file
 */
function insertMP4Metadata(mp4Data, metadataAtom) {
  // Find moov atom
  const moovPos = findAtom(mp4Data, 'moov');
  if (moovPos === -1) {
    console.warn('Could not find moov atom in MP4 file');
    return mp4Data.buffer;
  }

  const view = new DataView(mp4Data.buffer);
  const moovSize = view.getUint32(moovPos, false);
  const moovEnd = moovPos + moovSize;

  // Find or create udta atom within moov
  let udtaPos = findAtom(mp4Data, 'udta', moovPos + 8, moovEnd);

  if (udtaPos === -1) {
    // Create new udta atom with meta and ilst
    const metaAtom = createMetaAtom(metadataAtom);
    const udtaAtom = createUdtaAtom(metaAtom);

    // Insert udta before the end of moov
    const newSize = mp4Data.length + udtaAtom.length;
    const newMP4 = new Uint8Array(newSize);

    // Copy everything before moov end
    newMP4.set(mp4Data.subarray(0, moovEnd), 0);
    // Insert udta
    newMP4.set(udtaAtom, moovEnd);
    // Copy everything after moov
    newMP4.set(mp4Data.subarray(moovEnd), moovEnd + udtaAtom.length);

    // Update moov size
    const newView = new DataView(newMP4.buffer);
    newView.setUint32(moovPos, moovSize + udtaAtom.length, false);

    return newMP4.buffer;
  }

  // udta exists, find/replace meta atom
  const udtaSize = view.getUint32(udtaPos, false);
  const udtaEnd = udtaPos + udtaSize;
  let metaPos = findAtom(mp4Data, 'meta', udtaPos + 8, udtaEnd);

  if (metaPos === -1) {
    // Add meta atom to existing udta
    const metaAtom = createMetaAtom(metadataAtom);
    const newSize = mp4Data.length + metaAtom.length;
    const newMP4 = new Uint8Array(newSize);

    newMP4.set(mp4Data.subarray(0, udtaEnd), 0);
    newMP4.set(metaAtom, udtaEnd);
    newMP4.set(mp4Data.subarray(udtaEnd), udtaEnd + metaAtom.length);

    // Update sizes
    const newView = new DataView(newMP4.buffer);
    newView.setUint32(udtaPos, udtaSize + metaAtom.length, false);
    newView.setUint32(moovPos, moovSize + metaAtom.length, false);

    return newMP4.buffer;
  }

  // Replace existing meta atom
  const metaSize = view.getUint32(metaPos, false);
  const newMetaAtom = createMetaAtom(metadataAtom);
  const sizeDiff = newMetaAtom.length - metaSize;

  const newSize = mp4Data.length + sizeDiff;
  const newMP4 = new Uint8Array(newSize);

  newMP4.set(mp4Data.subarray(0, metaPos), 0);
  newMP4.set(newMetaAtom, metaPos);
  newMP4.set(mp4Data.subarray(metaPos + metaSize), metaPos + newMetaAtom.length);

  // Update sizes
  const newView = new DataView(newMP4.buffer);
  newView.setUint32(udtaPos, udtaSize + sizeDiff, false);
  newView.setUint32(moovPos, moovSize + sizeDiff, false);

  return newMP4.buffer;
}

/**
 * Find atom position in MP4 data
 */
function findAtom(data, type, start = 0, end = data.length) {
  let pos = start;
  const targetBytes = new TextEncoder().encode(type);

  while (pos < end - 8) {
    const view = new DataView(data.buffer, data.byteOffset + pos);
    const size = view.getUint32(0, false);

    if (size < 8 || pos + size > end) break;

    // Check atom type
    const atomType = data.subarray(pos + 4, pos + 8);
    let match = true;
    for (let i = 0; i < 4; i++) {
      if (atomType[i] !== targetBytes[i]) {
        match = false;
        break;
      }
    }

    if (match) return pos;

    pos += size;
  }

  return -1;
}

/**
 * Create udta atom
 */
function createUdtaAtom(metaAtom) {
  const encoder = new TextEncoder();
  const size = 8 + metaAtom.length;
  const udta = new Uint8Array(size);
  const view = new DataView(udta.buffer);

  view.setUint32(0, size, false);
  udta.set(encoder.encode('udta'), 4);
  udta.set(metaAtom, 8);

  return udta;
}

/**
 * Create meta atom
 */
function createMetaAtom(ilstAtom) {
  const encoder = new TextEncoder();

  // meta atom has version/flags after type
  // meta: size(4) + 'meta'(4) + version/flags(4) + hdlr atom + ilst atom

  // Create minimal hdlr atom
  const hdlr = createHdlrAtom();
  const size = 12 + hdlr.length + ilstAtom.length;

  const meta = new Uint8Array(size);
  const view = new DataView(meta.buffer);

  view.setUint32(0, size, false);
  meta.set(encoder.encode('meta'), 4);
  view.setUint32(8, 0, false); // version/flags
  meta.set(hdlr, 12);
  meta.set(ilstAtom, 12 + hdlr.length);

  return meta;
}

/**
 * Create hdlr atom
 */
function createHdlrAtom() {
  const encoder = new TextEncoder();
  const name = 'Vinylfy';
  const nameBytes = encoder.encode(name);

  const size = 32 + nameBytes.length + 1; // +1 for null terminator
  const hdlr = new Uint8Array(size);
  const view = new DataView(hdlr.buffer);

  view.setUint32(0, size, false);
  hdlr.set(encoder.encode('hdlr'), 4);
  view.setUint32(8, 0, false); // version/flags
  view.setUint32(12, 0, false); // pre_defined
  hdlr.set(encoder.encode('mdir'), 16); // handler_type
  hdlr.set(encoder.encode('appl'), 20); // reserved[0]
  view.setUint32(24, 0, false); // reserved[1]
  view.setUint32(28, 0, false); // reserved[2]
  hdlr.set(nameBytes, 32);
  hdlr[32 + nameBytes.length] = 0; // null terminator

  return hdlr;
}

/**
 * Get a default metadata object
 * @returns {Object} - Empty metadata structure
 */
export function getEmptyMetadata() {
  return {
    title: '',
    artist: '',
    album: '',
    year: '',
    genre: '',
    comment: '',
    track: '',
    albumArtist: '',
    composer: '',
    picture: null
  };
}

/**
 * Check if file format supports metadata writing
 * @param {string} format - Output format (mp3, wav, flac, etc.)
 * @returns {boolean}
 */
export function supportsMetadataWriting(format) {
  const supportedFormats = ['mp3', 'flac', 'aac', 'm4a'];
  return supportedFormats.includes(format.toLowerCase());
}

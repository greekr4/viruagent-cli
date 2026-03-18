const createSmartComment = (instaApi) => {
  const analyzePost = async ({ shortcode }) => {
    // 1. Post detail
    const post = await instaApi.getPostDetail(shortcode);
    const caption = post.caption || '';
    const isVideo = post.isVideo;
    const mediaType = post.mediaType;
    const thumbnailUrl = post.imageUrl;
    const ownerUsername = post.owner?.username || '';

    // 2. Owner profile
    let ownerProfile = null;
    try {
      ownerProfile = await instaApi.getProfile(ownerUsername);
    } catch {
      // Ignore failures (e.g., private account)
    }

    // 3. Thumbnail image base64 (for Claude Code Vision)
    let thumbnailBase64 = null;
    let thumbnailMediaType = 'image/jpeg';
    if (thumbnailUrl) {
      try {
        const res = await fetch(thumbnailUrl);
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          thumbnailBase64 = buffer.toString('base64');
          const ct = res.headers.get('content-type');
          if (ct) thumbnailMediaType = ct;
        }
      } catch {
        // Proceed with caption only on failure
      }
    }

    const contentType = isVideo
      ? 'video (reel)'
      : mediaType?.includes('Sidecar')
        ? 'carousel (multiple images)'
        : 'photo';

    return {
      shortcode,
      contentType,
      caption,
      isVideo,
      owner: {
        username: ownerUsername,
        fullName: ownerProfile?.fullName || '',
        biography: ownerProfile?.biography || '',
        followerCount: ownerProfile?.followerCount || 0,
      },
      engagement: {
        likeCount: post.likeCount,
        commentCount: post.commentCount,
      },
      thumbnailUrl,
      thumbnailBase64,
      thumbnailMediaType,
      postUrl: post.url,
    };
  };

  return { analyzePost };
};

module.exports = createSmartComment;

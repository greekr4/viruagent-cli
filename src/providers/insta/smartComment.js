const createSmartComment = (instaApi) => {
  const analyzePost = async ({ shortcode }) => {
    // 1. 게시물 상세
    const post = await instaApi.getPostDetail(shortcode);
    const caption = post.caption || '';
    const isVideo = post.isVideo;
    const mediaType = post.mediaType;
    const thumbnailUrl = post.imageUrl;
    const ownerUsername = post.owner?.username || '';

    // 2. 작성자 프로필
    let ownerProfile = null;
    try {
      ownerProfile = await instaApi.getProfile(ownerUsername);
    } catch {
      // 비공개 등 실패 무시
    }

    // 3. 썸네일 이미지 base64 (Claude Code Vision용)
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
        // 실패해도 캡션만으로 진행
      }
    }

    const contentType = isVideo
      ? '영상(릴스)'
      : mediaType?.includes('Sidecar')
        ? '캐러셀(다중 이미지)'
        : '사진';

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

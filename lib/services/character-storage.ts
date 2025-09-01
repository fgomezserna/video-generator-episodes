import { 
  getStorage, 
  ref, 
  uploadBytes, 
  uploadString,
  getDownloadURL, 
  deleteObject, 
  getMetadata,
  updateMetadata,
  StorageReference 
} from 'firebase/storage';
import { CharacterReferenceImage } from '../types';

export interface StorageUploadOptions {
  contentType?: string;
  customMetadata?: Record<string, string>;
  cacheControl?: string;
}

export interface ImageProcessingOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png';
  generateThumbnail?: boolean;
  thumbnailSize?: number;
}

export class CharacterStorageService {
  private storage;
  private basePath = 'characters';

  constructor() {
    this.storage = getStorage();
  }

  /**
   * Upload a character reference image from base64 data
   */
  async uploadReferenceImage(
    characterId: string,
    versionId: string,
    imageData: string,
    metadata: Partial<CharacterReferenceImage>,
    options: StorageUploadOptions = {}
  ): Promise<CharacterReferenceImage> {
    try {
      const imageId = crypto.randomUUID();
      const fileName = `${imageId}.${this.getFormatFromDataUrl(imageData)}`;
      const imagePath = `${this.basePath}/${characterId}/versions/${versionId}/images/${fileName}`;
      
      const imageRef = ref(this.storage, imagePath);
      
      // Upload the image
      const uploadResult = await uploadString(imageRef, imageData, 'data_url', {
        contentType: options.contentType || this.getContentTypeFromDataUrl(imageData),
        customMetadata: {
          characterId,
          versionId,
          imageType: metadata.type || 'reference',
          generatedWith: metadata.metadata?.generatedWith || 'manual',
          ...options.customMetadata
        },
        cacheControl: options.cacheControl || 'public, max-age=31536000' // 1 year
      });

      // Get the download URL
      const downloadUrl = await getDownloadURL(uploadResult.ref);
      
      // Get file metadata for size calculation
      const fileMetadata = await getMetadata(uploadResult.ref);
      
      // Parse image dimensions (this is simplified - in production you might want to use a proper image processing library)
      const dimensions = await this.getImageDimensions(imageData);

      const referenceImage: CharacterReferenceImage = {
        id: imageId,
        url: downloadUrl,
        type: metadata.type || 'reference',
        metadata: {
          width: dimensions.width,
          height: dimensions.height,
          format: this.getFormatFromDataUrl(imageData),
          size: fileMetadata.size || 0,
          generatedWith: metadata.metadata?.generatedWith,
          prompt: metadata.metadata?.prompt,
          seed: metadata.metadata?.seed
        },
        isActive: metadata.isActive ?? true,
        createdAt: new Date()
      };

      return referenceImage;
    } catch (error) {
      throw new Error(`Failed to upload reference image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Upload image from URL (for external generated images)
   */
  async uploadImageFromUrl(
    characterId: string,
    versionId: string,
    imageUrl: string,
    metadata: Partial<CharacterReferenceImage>,
    options: StorageUploadOptions = {}
  ): Promise<CharacterReferenceImage> {
    try {
      // Download the image
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      
      const imageId = crypto.randomUUID();
      const format = this.getFormatFromContentType(blob.type);
      const fileName = `${imageId}.${format}`;
      const imagePath = `${this.basePath}/${characterId}/versions/${versionId}/images/${fileName}`;
      
      const imageRef = ref(this.storage, imagePath);
      
      // Upload the blob
      const uploadResult = await uploadBytes(imageRef, blob, {
        contentType: blob.type,
        customMetadata: {
          characterId,
          versionId,
          imageType: metadata.type || 'generated',
          originalUrl: imageUrl,
          generatedWith: metadata.metadata?.generatedWith || 'unknown',
          ...options.customMetadata
        },
        cacheControl: options.cacheControl || 'public, max-age=31536000'
      });

      const downloadUrl = await getDownloadURL(uploadResult.ref);
      const fileMetadata = await getMetadata(uploadResult.ref);
      
      // For external images, we might not have exact dimensions without processing
      // This is a simplified version - in production you'd want proper image processing
      const dimensions = { width: 1024, height: 1024 }; // Default fallback

      const referenceImage: CharacterReferenceImage = {
        id: imageId,
        url: downloadUrl,
        type: metadata.type || 'generated',
        metadata: {
          width: dimensions.width,
          height: dimensions.height,
          format,
          size: fileMetadata.size || 0,
          generatedWith: metadata.metadata?.generatedWith,
          prompt: metadata.metadata?.prompt,
          seed: metadata.metadata?.seed
        },
        isActive: metadata.isActive ?? true,
        createdAt: new Date()
      };

      return referenceImage;
    } catch (error) {
      throw new Error(`Failed to upload image from URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a reference image
   */
  async deleteReferenceImage(
    characterId: string,
    versionId: string,
    imageId: string
  ): Promise<void> {
    try {
      // Find the image file in storage (we need to search by metadata since we don't store the full path)
      const versionPath = `${this.basePath}/${characterId}/versions/${versionId}/images/`;
      
      // In a real implementation, you might need to list all files and find the one with matching metadata
      // For now, we'll assume the filename is predictable or we store the path separately
      const possibleFormats = ['png', 'jpg', 'jpeg', 'webp'];
      
      for (const format of possibleFormats) {
        try {
          const imagePath = `${versionPath}${imageId}.${format}`;
          const imageRef = ref(this.storage, imagePath);
          await deleteObject(imageRef);
          break; // Successfully deleted
        } catch (error) {
          // Continue trying other formats
          continue;
        }
      }
    } catch (error) {
      throw new Error(`Failed to delete reference image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate optimized versions of an image (thumbnails, different sizes)
   */
  async generateImageVariants(
    characterId: string,
    versionId: string,
    originalImage: CharacterReferenceImage,
    variants: { suffix: string; options: ImageProcessingOptions }[]
  ): Promise<CharacterReferenceImage[]> {
    const results: CharacterReferenceImage[] = [];
    
    try {
      // Download the original image
      const response = await fetch(originalImage.url);
      const blob = await response.blob();
      
      // Note: This is a simplified implementation
      // In production, you would use a proper image processing library like Sharp
      // or integrate with cloud image processing services
      
      for (const variant of variants) {
        const variantId = `${originalImage.id}_${variant.suffix}`;
        const format = variant.options.format || 'webp';
        const fileName = `${variantId}.${format}`;
        const imagePath = `${this.basePath}/${characterId}/versions/${versionId}/variants/${fileName}`;
        
        const imageRef = ref(this.storage, imagePath);
        
        // Upload the variant (in production, you'd process the image here)
        const uploadResult = await uploadBytes(imageRef, blob, {
          contentType: `image/${format}`,
          customMetadata: {
            characterId,
            versionId,
            originalImageId: originalImage.id,
            variant: variant.suffix,
            imageType: 'variant'
          }
        });

        const downloadUrl = await getDownloadURL(uploadResult.ref);
        const fileMetadata = await getMetadata(uploadResult.ref);

        const variantImage: CharacterReferenceImage = {
          id: variantId,
          url: downloadUrl,
          type: 'variation',
          metadata: {
            width: variant.options.maxWidth || originalImage.metadata.width,
            height: variant.options.maxHeight || originalImage.metadata.height,
            format,
            size: fileMetadata.size || 0,
            generatedWith: 'manual'
          },
          isActive: true,
          createdAt: new Date()
        };

        results.push(variantImage);
      }

      return results;
    } catch (error) {
      throw new Error(`Failed to generate image variants: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clean up old versions of character images
   */
  async cleanupOldVersions(characterId: string, keepVersions: string[] = []): Promise<void> {
    try {
      // In a real implementation, you would list all version folders
      // and delete those not in the keepVersions array
      // This is a placeholder for the cleanup logic
      console.log(`Cleaning up old versions for character ${characterId}, keeping: ${keepVersions.join(', ')}`);
      
      // Implementation would involve:
      // 1. List all version folders under characters/{characterId}/versions/
      // 2. Compare with keepVersions array
      // 3. Delete entire version folders not in the keep list
    } catch (error) {
      throw new Error(`Failed to cleanup old versions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get storage usage statistics for a character
   */
  async getStorageStats(characterId: string): Promise<{
    totalSize: number;
    imageCount: number;
    versionCount: number;
    storageUrl: string;
  }> {
    try {
      // This would require implementing storage listing and metadata aggregation
      // For now, return placeholder data
      return {
        totalSize: 0,
        imageCount: 0,
        versionCount: 0,
        storageUrl: `${this.basePath}/${characterId}`
      };
    } catch (error) {
      throw new Error(`Failed to get storage stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private getFormatFromDataUrl(dataUrl: string): string {
    const match = dataUrl.match(/data:image\/(\w+);/);
    return match ? match[1] : 'png';
  }

  private getContentTypeFromDataUrl(dataUrl: string): string {
    const match = dataUrl.match(/data:([^;]+);/);
    return match ? match[1] : 'image/png';
  }

  private getFormatFromContentType(contentType: string): string {
    const match = contentType.match(/image\/(\w+)/);
    return match ? match[1] : 'png';
  }

  private async getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.onerror = () => {
        resolve({ width: 1024, height: 1024 }); // Default fallback
      };
      img.src = dataUrl;
    });
  }
}